// Quick test: call rewrite API with test article
const http = require("http");

const HOST = "47.103.222.34";
const PORT = 80;
const PASS = "jielee4422";

function post(path, data, cookie) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const headers = {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    };
    if (cookie) headers["Cookie"] = cookie;

    const req = http.request({ hostname: HOST, port: PORT, path, method: "POST", headers }, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        resolve({ headers: res.headers, body: JSON.parse(raw) });
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  // Login
  const login = await post("/api/auth/login", { password: PASS });
  const setCookie = login.headers["set-cookie"];
  const sc = Array.isArray(setCookie) ? setCookie.join("; ") : (setCookie || "");
  const authToken = (sc.match(/auth_token=([^;]+)/) || [])[1];
  if (!authToken) {
    console.error("Login failed");
    process.exit(1);
  }
  console.log("Logged in");

  // Read test article
  const fs = require("fs");
  const article = fs.readFileSync(__dirname + "/test-article2.txt", "utf-8");
  const title = "情绪上头时敲出去的字，最后都成了巴掌";

  // Rewrite
  console.log(`Rewriting: ${title}`);
  console.time("rewrite");
  const res = await post(
    "/api/rewrite",
    { title, content: article, targetLength: 1400, level: "pro" },
    `auth_token=${authToken}`
  );
  console.timeEnd("rewrite");

  if (res.body.error) {
    console.error("Error:", res.body.error);
    process.exit(1);
  }

  const versions = res.body.versions || res.body;
  versions.forEach((v) => {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`【${v.version}】 ${v.content.length}字`);
    console.log("=".repeat(60));
    console.log(v.content);
  });
}

main().catch((e) => console.error(e));
