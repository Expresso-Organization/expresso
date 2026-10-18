declare module "*.mjs" {
 export const components: Record<string, import("react").ComponentType<Record<string, unknown>>>;
 export const sourceCss: string;
}
