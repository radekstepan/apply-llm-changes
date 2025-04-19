First, the config:

/* START OF config/settings.yaml */
port: 8080
database:
  url: postgres://...
/* END OF config/settings.yaml */

Now the main script. This is `scripts/run.sh`:
```bash
#!/bin/bash
echo "Starting..."
node dist/index.js
echo "Done."
```

<file path="docs/README.md">
# Project Docs
This is the documentation.
</file>
