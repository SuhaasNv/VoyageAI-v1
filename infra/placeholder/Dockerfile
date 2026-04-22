FROM python:3.11-slim
RUN useradd -m appuser
USER appuser
COPY server.py .
EXPOSE 8000
CMD ["python3", "server.py"]
