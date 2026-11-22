import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { File, Storage } from '@google-cloud/storage';

import {
  canAccessObject,
  getObjectAclPolicy,
  ObjectAclPolicy,
  ObjectPermission,
  setObjectAclPolicy,
} from './objectAcl';
import {
  assertStorageFileBelongsToEnvironment,
  objectPathForNewObject,
  requireStorageEnvironmentConfig,
  resolvePublicObjectPaths,
  resolvePrivateObjectPath,
} from './storage-environment';

const REPLIT_SIDECAR_ENDPOINT = 'http://127.0.0.1:1106';

type StorageBackend = 'replit' | 'gcs';

function storageBackend(): StorageBackend {
  const configured = process.env.WORKRATE_STORAGE_BACKEND?.trim().toLowerCase();
  if (configured === 'replit' || configured === 'gcs') return configured;
  if (
    process.env.GCS_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.GCS_PROJECT_ID
  ) {
    return 'gcs';
  }
  return 'replit';
}

function createStorageClient(): Storage {
  if (storageBackend() === 'gcs') {
    const rawCredentials = process.env.GCS_SERVICE_ACCOUNT_JSON?.trim();
    if (rawCredentials) {
      let credentials: Record<string, unknown>;
      try {
        credentials = JSON.parse(rawCredentials) as Record<string, unknown>;
      } catch {
        throw new Error('GCS_SERVICE_ACCOUNT_JSON must contain valid JSON.');
      }
      const projectId = process.env.GCS_PROJECT_ID?.trim()
        || (typeof credentials.project_id === 'string' ? credentials.project_id : undefined);
      return new Storage({ credentials: credentials as any, projectId });
    }

    return new Storage({
      projectId: process.env.GCS_PROJECT_ID?.trim() || undefined,
    });
  }

  return new Storage({
    credentials: {
      audience: 'replit',
      subject_token_type: 'access_token',
      token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
      type: 'external_account',
      credential_source: {
        url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
        format: {
          type: 'json',
          subject_token_field_name: 'access_token',
        },
      },
      universe_domain: 'googleapis.com',
    },
    projectId: '',
  });
}

export const objectStorageClient = createStorageClient();

export class ObjectNotFoundError extends Error {
  constructor() {
    super('Object not found');
    this.name = 'ObjectNotFoundError';
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  constructor() {}

  getPublicObjectSearchPaths(): Array<string> {
    const config = requireStorageEnvironmentConfig();
    return config.publicRoots.map(
      (root) => `/${root.bucketId}/${root.objectPrefix}/${config.environment}`,
    );
  }

  getPrivateObjectDir(): string {
    const config = requireStorageEnvironmentConfig();
    return `/${config.bucketId}/${config.environmentObjectPrefix}`;
  }

  async searchPublicObject(filePath: string): Promise<File | null> {
    const config = requireStorageEnvironmentConfig();
    for (const resolved of resolvePublicObjectPaths(filePath, config)) {
      const bucket = objectStorageClient.bucket(resolved.bucketId);
      const file = bucket.file(resolved.objectName);

      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }

    return null;
  }

  async downloadObject(
    file: File,
    cacheTtlSec: number = 3600,
  ): Promise<Response> {
    const config = requireStorageEnvironmentConfig();
    assertStorageFileBelongsToEnvironment(
      file.bucket.name,
      file.name,
      config,
    );
    const [metadata] = await file.getMetadata();
    const aclPolicy = await getObjectAclPolicy(file);
    const isPublic = aclPolicy?.visibility === 'public';

    const nodeStream = file.createReadStream();
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const headers: Record<string, string> = {
      'Content-Type':
        (metadata.contentType as string) || 'application/octet-stream',
      'Cache-Control': `${isPublic ? 'public' : 'private'}, max-age=${cacheTtlSec}`,
    };
    if (metadata.size) {
      headers['Content-Length'] = String(metadata.size);
    }

    return new Response(webStream, { headers });
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    if (!privateObjectDir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          'tool and set PRIVATE_OBJECT_DIR env var.',
      );
    }

    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    return signObjectURL({
      bucketName,
      objectName,
      method: 'PUT',
      ttlSec: 900,
    });
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    let resolved;
    try {
      resolved = resolvePrivateObjectPath(objectPath);
    } catch {
      throw new ObjectNotFoundError();
    }
    const bucket = objectStorageClient.bucket(resolved.bucketId);
    const objectFile = bucket.file(resolved.objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith('https://storage.googleapis.com/')) {
      return rawPath;
    }

    const url = new URL(rawPath);
    const config = requireStorageEnvironmentConfig();
    const { bucketName, objectName } = parseObjectPath(url.pathname);
    if (bucketName !== config.bucketId) throw new ObjectNotFoundError();
    const prefix = `${config.environmentObjectPrefix}/`;
    if (!objectName.startsWith(prefix)) {
      const legacyPrefix = `${config.privateRoot.objectPrefix}/`;
      if (!config.legacyReadsAllowed || !objectName.startsWith(legacyPrefix)) {
        throw new ObjectNotFoundError();
      }
      return `/objects/${objectName.slice(config.privateRoot.objectPrefix.length + 1)}`;
    }
    return objectPathForNewObject(objectName.slice(prefix.length), config);
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy,
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith('/')) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: File;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith('/')) {
    path = `/${path}`;
  }
  const pathParts = path.split('/');
  if (pathParts.length < 3) {
    throw new Error('Invalid path: must contain at least a bucket name');
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join('/');

  return {
    bucketName,
    objectName,
  };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: 'GET' | 'PUT' | 'DELETE' | 'HEAD';
  ttlSec: number;
}): Promise<string> {
  if (storageBackend() === 'gcs') {
    const action = method === 'PUT' ? 'write'
      : method === 'DELETE' ? 'delete'
      : 'read';
    const [signedUrl] = await objectStorageClient
      .bucket(bucketName)
      .file(objectName)
      .getSignedUrl({
        version: 'v4',
        action,
        expires: Date.now() + ttlSec * 1000,
      });
    return signedUrl;
  }

  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}.`,
    );
  }

  const data = await response.json() as { signed_url: string };
  return data.signed_url;
}
