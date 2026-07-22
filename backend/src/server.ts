import "dotenv/config";
import { app } from "./app.js";

const port = Number(process.env.PORT ?? 8080);

app.listen(port, () => {
    console.log(`ProxiAI API running on http://localhost:${port}`);
});