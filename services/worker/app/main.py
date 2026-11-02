import logging

import uvicorn

from app.config import get_settings


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    settings = get_settings()
    uvicorn.run("app.api:app", host=settings.worker_host, port=settings.worker_port)


if __name__ == "__main__":
    main()
