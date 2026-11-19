/**
 * Readability fix for downscaled screens (phones, 1366x768 laptops).
 *
 * With `letterbox` + fixed width/height, KAPLAY renders every frame into an offscreen framebuffer of
 * GAME_W*pixelDensity x GAME_H*pixelDensity and then blits it into the canvas viewport using the global texture filter
 * ("nearest"). Whenever the window is smaller than the game field (CSS px per unit < 1) that blit MINIFIES with nearest
 * sampling and silently drops whole pixel rows / columns: 1 px strokes of the UI font vanish (letters lose stems),
 * thin HUD lines flicker. Switching only the framebuffer texture's MIN filter to LINEAR keeps every stroke (slightly
 * softer) while magnification (big desktop windows) stays nearest/crisp. Sprites/fonts keep their own filters.
 *
 * Must run while KAPLAY's framebuffer is bound (inside an onDraw). Idempotent per framebuffer; no-op on failure.
 */
const done = new WeakSet<object>();
let gl: WebGLRenderingContext | null | undefined;

export function smoothFramebufferMinify(canvas: HTMLCanvasElement): void {
  try {
    if (gl === undefined) gl = (canvas.getContext("webgl") as WebGLRenderingContext | null) ?? null;
    if (!gl) return;
    const fbo = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    if (!fbo || done.has(fbo)) return;
    done.add(fbo);
    const tex = gl.getFramebufferAttachmentParameter(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME) as WebGLTexture | null;
    if (!tex || !(tex instanceof WebGLTexture)) return;
    const prev = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, prev);
  } catch {
    /* ignore: purely cosmetic */
  }
}
