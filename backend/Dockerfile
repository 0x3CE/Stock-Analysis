FROM python:3.12.3-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY ./requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Extension httpfs de DuckDB (lecture du crible sur Cloudflare R2), rangée dans
# /app/.duckdb_extensions, là où services/crible_service.py la cherche.
RUN python -c "import duckdb; c = duckdb.connect(); c.execute(\"SET extension_directory='/app/.duckdb_extensions'\"); c.execute('INSTALL httpfs')"

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
