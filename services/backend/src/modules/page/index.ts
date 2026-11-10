import type { PageService as LegacyPageService } from "./legacy-mysql-service.js";
export { PageService } from "./service.js";
export { MongoPageService } from "./service.js";
export type PageApi = Pick<LegacyPageService, keyof LegacyPageService> & { editComposition?: import("./service.js").PageService["editComposition"]; restoreRevision?: import("./service.js").PageService["restoreRevision"]; elementGuide?: import("./service.js").PageService["elementGuide"]; editElementByAgent?: import("./service.js").PageService["editElementByAgent"]; addRecordSection?: import("./service.js").PageService["addRecordSection"]; editorDesign?: import("./service.js").PageService["editorDesign"]; editableRender?: import("./service.js").PageService["editableRender"] };
export { PageElementEditor } from "./element-edit.js";
export { PageElementIssues, PageServiceError } from "./public.js";
export type { AgentElementEdit, ElementChange } from "./element-edit.js";
