/**
 * Sale Bill — the payload builders (§18), one file per DTO, and the lifecycle
 * bodies (§4.1). Everything is built from draft state with an explicit
 * whitelist (§4.4); nothing is ever echoed from a response.
 */
export * from "./build-save-payload";
