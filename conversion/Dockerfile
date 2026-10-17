FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends libreoffice-writer qpdf \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --create-home --uid 10001 converter

WORKDIR /app
COPY service.py /app/service.py
RUN chown -R converter:converter /app
USER converter

ENV PORT=8080
EXPOSE 8080
CMD ["python", "/app/service.py"]
