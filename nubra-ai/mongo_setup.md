# Local MongoDB Setup

Use a local MongoDB instance for Nubra AI:

```text
mongodb://localhost:27017/nubra_ai
```

## Option 1: MongoDB Community Server

1. Install MongoDB Community Server.
2. Start the `MongoDB` service.
3. Verify it is running:

```powershell
mongosh "mongodb://localhost:27017/nubra_ai"
```

## Option 2: Docker

```powershell
docker run -d --name nubra-mongo -p 27017:27017 mongo:7
```

Then verify:

```powershell
mongosh "mongodb://localhost:27017/nubra_ai"
```

GridFS collections `fs.files` and `fs.chunks` are created automatically when files are uploaded.
