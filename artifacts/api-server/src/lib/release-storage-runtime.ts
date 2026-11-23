import { pool } from "@workspace/db";
import { readDatabaseEnvironmentMarker } from "@workspace/db/environment-marker";
import { assertConfiguredStorageBucketEnvironment } from "./storage-bucket-runtime";
import {
  validateReleaseBuildConfiguration,
  validateReleaseStorage,
  type ReleaseStorageVerification,
} from "./release-storage-validation";
import { getEmbeddedApplicationSourceId } from "./application-source-identity";

let latestVerification: ReleaseStorageVerification | null = null;

export async function verifyConfiguredReleaseStorage(): Promise<ReleaseStorageVerification> {
  latestVerification = await validateReleaseStorage({
    verifyBucket: assertConfiguredStorageBucketEnvironment,
    async readDatabaseMarker() {
      let client;

      try {
        client = await pool.connect();
        return await readDatabaseEnvironmentMarker(client);
      } catch (error) {
        console.error("DATABASE_CONNECTION_OR_MARKER_FAILED", error);
        throw error;
      } finally {
        client?.release();
      }
    },
  }, process.env, getEmbeddedApplicationSourceId());
  return latestVerification;
}

export async function verifyConfiguredReleaseBuild(
  immutableSourceId: string,
): Promise<ReleaseStorageVerification> {
  return validateReleaseBuildConfiguration(
    process.env,
    () => new Date(),
    immutableSourceId,
  );
}

export function getLatestReleaseStorageVerification(): ReleaseStorageVerification {
  if (!latestVerification) {
    throw new Error("Release storage verification has not run.");
  }
  return latestVerification;
}