FROM python:3.11-slim
COPY --from=ghcr.io/astral-sh/uv:0.13.6 /uv /uvx /bin/

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never PYTHONUNBUFFERED=1

COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev

COPY app ./app
ENV PATH=/app/.venv/bin:$PATH
RUN useradd --create-home worker && mkdir -p /models && chown worker /models
ENV MODELS_DIR=/models
USER worker
EXPOSE 8000
CMD ["python", "-m", "app.main"]
