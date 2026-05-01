const { createApp } = require("./app");

const port = Number(process.env.PORT || 4000);
const app = createApp();

app.listen(port, () => {
  process.stdout.write(`CodeGuardian backend listening on http://127.0.0.1:${port}\n`);
});
