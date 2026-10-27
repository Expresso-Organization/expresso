import type { PageService as LegacyPageService } from "./legacy-mysql-service.js";
export { PageService } from "./service.js";
export { MongoPageService } from "./service.js";
export type PageApi = Pick<LegacyPageService, keyof LegacyPageService> & { editComposition?: import("./service.js").PageService["editComposition"]; restoreRevision?: import("./service.js").PageService["restoreRevision"]; instructElement?: import("./service.js").PageService["instructElement"]; addRecordSection?: import("./service.js").PageService["addRecordSection"]; editorDesign?: import("./service.js").PageService["editorDesign"]; editableRender?: import("./service.js").PageService["editableRender"] };
export { PageElementEditor } from "./element-edit.js";
export { PageServiceError } from "./public.js";
