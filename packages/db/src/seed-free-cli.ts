import { getPrismaClient, disconnectPrismaClient } from "./client.js";
import { initializeFreeDatabase } from "./seed-free.js";

try {
  const result = await initializeFreeDatabase(await getPrismaClient());
  console.log(
    `免费版初始化完成：4 项网站设置、3 个服务商；管理员${result.adminCreated ? "已创建" : "保持不变"}。`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "免费版初始化失败。");
  process.exitCode = 1;
} finally {
  await disconnectPrismaClient();
}
