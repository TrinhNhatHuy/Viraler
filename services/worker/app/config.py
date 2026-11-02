from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Reads real env vars first, then services/worker/.env, then the repo-root .env.
    model_config = SettingsConfigDict(env_file=("../../.env", ".env"), extra="ignore")

    database_url: str
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    worker_poll_interval_seconds: float = 2.0
    models_dir: str = "./models"
    kokoro_model: Literal["fp32", "int8", "fp16"] = "fp32"
    worker_host: str = "0.0.0.0"
    worker_port: int = 8000


def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # database_url comes from the environment
