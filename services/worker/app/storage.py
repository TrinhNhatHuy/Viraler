"""Supabase Storage access for the worker (service role; bypasses Storage RLS).

Object keys mirror packages/shared/src/storage-paths.ts.
"""

from urllib.parse import quote

import httpx

MEDIA_BUCKET = "media"


def voiceover_path(user_id: str, project_id: str, file_name: str) -> str:
    return f"{user_id}/{project_id}/voiceover/{file_name}"


def is_in_project_folder(path: str, user_id: str, project_id: str) -> bool:
    """True if `path` is a file inside the project's folder tree (no `..` escapes)."""
    prefix = f"{user_id}/{project_id}/"
    return path.startswith(prefix) and ".." not in path[len(prefix) :].split("/")


class ObjectTooLargeError(Exception):
    pass


class StorageClient:
    def __init__(self, url: str, service_key: str, *, client: httpx.Client | None = None) -> None:
        if not url or not service_key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
        self._base = url.rstrip("/") + "/storage/v1"
        self._client = client or httpx.Client(timeout=httpx.Timeout(30, read=120))
        self._headers = {"authorization": f"Bearer {service_key}", "apikey": service_key}

    def upload(
        self, bucket: str, path: str, data: bytes, content_type: str, *, upsert: bool = True
    ) -> None:
        """Uploads (or overwrites, with upsert) an object. Raises on HTTP errors."""
        res = self._client.post(
            f"{self._base}/object/{bucket}/{quote(path)}",
            content=data,
            headers={
                **self._headers,
                "content-type": content_type,
                "x-upsert": "true" if upsert else "false",
                "cache-control": "max-age=3600",
            },
        )
        res.raise_for_status()

    def download(self, bucket: str, path: str, *, max_bytes: int | None = None) -> bytes:
        """Downloads an object. Raises on HTTP errors, ObjectTooLargeError past `max_bytes`."""
        url = f"{self._base}/object/{bucket}/{quote(path)}"
        with self._client.stream("GET", url, headers=self._headers) as res:
            res.raise_for_status()
            declared = int(res.headers.get("content-length") or 0)
            if max_bytes is not None and declared > max_bytes:
                raise ObjectTooLargeError(f"{path} is {declared} bytes (max {max_bytes})")
            chunks: list[bytes] = []
            size = 0
            for chunk in res.iter_bytes():
                size += len(chunk)
                if max_bytes is not None and size > max_bytes:
                    raise ObjectTooLargeError(f"{path} is over {max_bytes} bytes")
                chunks.append(chunk)
            return b"".join(chunks)
