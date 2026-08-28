import type { MediaService } from "./service.js";
export { MediaService } from "./service.js";
export type MediaApi = Pick<MediaService, keyof MediaService>;
export { MediaError } from "./public.js";
