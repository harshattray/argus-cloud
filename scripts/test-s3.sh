#!/usr/bin/env bash
#
# Disposable local S3 (MinIO) for the storage checks that need a real S3 API.
#
# The filesystem driver runs everywhere; `test/storage.test.mjs` skips its S4–S6
# blocks without this. Those blocks are the ones that matter most, because they
# drive presigned URLs end to end — an unauthenticated PUT, an oversized upload
# rejected by the pinned content-length, an expired URL refused — and walk
# `deletePrefix` past S3's 1000-key pagination boundary.
#
#   eval "$(scripts/test-s3.sh start)" && npm test
#   scripts/test-s3.sh stop
#
# Requires: brew install minio
#
# MinIO is S3-compatible and stands in for Cloudflare R2, which is also
# S3-compatible. It proves the driver against a real implementation of the
# protocol; it does not prove R2's own quirks, quotas, or credentials — that
# stays open until real R2 credentials exist (FUTURENORMA §4 Step 5).
set -euo pipefail

PORT="${NORMA_TEST_S3_PORT:-9410}"
CONSOLE_PORT="${NORMA_TEST_S3_CONSOLE_PORT:-9411}"
DATA_DIR="${NORMA_TEST_S3_DIR:-/tmp/normascope-tests3}"
BUCKET=normascope-test
USER=normascope
PASS=normascope-test-secret
ENDPOINT="http://127.0.0.1:${PORT}"

if ! command -v minio >/dev/null 2>&1; then
  echo "minio not found — run: brew install minio" >&2
  exit 1
fi

case "${1:-}" in
  start)
    mkdir -p "$DATA_DIR"
    if ! curl -fsS -o /dev/null "${ENDPOINT}/minio/health/live" 2>/dev/null; then
      MINIO_ROOT_USER="$USER" MINIO_ROOT_PASSWORD="$PASS" \
        minio server "$DATA_DIR" --address "127.0.0.1:${PORT}" --console-address "127.0.0.1:${CONSOLE_PORT}" \
        >"$DATA_DIR/minio.log" 2>&1 &
      for _ in $(seq 1 40); do
        curl -fsS -o /dev/null "${ENDPOINT}/minio/health/live" 2>/dev/null && break
        sleep 0.25
      done
    fi

    # Bucket creation goes through the SDK the driver already depends on,
    # rather than adding `mc` as a second tool to install.
    NORMA_TEST_ENDPOINT="$ENDPOINT" NORMA_TEST_USER="$USER" NORMA_TEST_PASS="$PASS" NORMA_TEST_BUCKET="$BUCKET" \
    node --input-type=module -e '
      const { S3Client, CreateBucketCommand } = await import("@aws-sdk/client-s3");
      const c = new S3Client({
        region: "us-east-1",
        endpoint: process.env.NORMA_TEST_ENDPOINT,
        forcePathStyle: true,
        credentials: { accessKeyId: process.env.NORMA_TEST_USER, secretAccessKey: process.env.NORMA_TEST_PASS },
      });
      try { await c.send(new CreateBucketCommand({ Bucket: process.env.NORMA_TEST_BUCKET })); }
      catch (e) { if (!/BucketAlreadyOwnedByYou|BucketAlreadyExists/.test(e.name)) throw e; }
    ' >&2

    # Printed as exports so the caller can `eval` them.
    echo "export NORMA_STORAGE_BUCKET=${BUCKET}"
    echo "export NORMA_STORAGE_ENDPOINT=${ENDPOINT}"
    echo "export NORMA_STORAGE_REGION=us-east-1"
    echo "export NORMA_STORAGE_ACCESS_KEY_ID=${USER}"
    echo "export NORMA_STORAGE_SECRET_ACCESS_KEY=${PASS}"
    echo "export NORMA_STORAGE_FORCE_PATH_STYLE=1"
    ;;
  stop)
    pkill -f "minio server ${DATA_DIR}" 2>/dev/null || true
    echo "stopped" >&2
    ;;
  *)
    echo "usage: $0 {start|stop}" >&2
    exit 1
    ;;
esac
