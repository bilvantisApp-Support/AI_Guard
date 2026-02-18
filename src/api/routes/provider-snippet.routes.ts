import Router from "@koa/router";
import { ProviderSnippetController } from "../controllers/provider-snippet.controller";
import { AuthMiddleware } from "../../auth/auth-middleware";

const router = new Router();

router.use(AuthMiddleware.requireAuth());

router.post("/", ProviderSnippetController.createProviderSnippet);
router.put("/:id", ProviderSnippetController.updateProviderSnippet);
router.get("/",ProviderSnippetController.getAllProviderSnippets);
router.get("/:provider",ProviderSnippetController.getProviderSnippet);

export { router as providerSnippetRouter };
