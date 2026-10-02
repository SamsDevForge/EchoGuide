import { depthMedian } from "./vision";
export interface ProbeReport {
  secure: boolean;
  camera: string;
  xr: string;
  phase:
    | "idle"
    | "requesting"
    | "running"
    | "complete"
    | "unavailable"
    | "cancelled";
  depth: string;
  depthUsage: string;
  pixels: string;
  simultaneousFrames: number;
  validDepthFrames: number;
  depthBufferFrames: number;
  poseFrames: number;
  centreDepthMetres: number | null;
  dimensions: string;
  note: string;
  userAgent: string;
  checkedAt: string;
  error: string | null;
}
export const newReport = (): ProbeReport => ({
  secure: window.isSecureContext,
  camera: "Not tested",
  xr: "Not tested",
  phase: "idle",
  depth: "Not tested; live sensing has no distance source",
  depthUsage: "Not tested",
  pixels: "Not tested",
  simultaneousFrames: 0,
  validDepthFrames: 0,
  depthBufferFrames: 0,
  poseFrames: 0,
  centreDepthMetres: null,
  dimensions: "—",
  note: "Camera and spoken guidance work independently of this optional depth check.",
  userAgent: navigator.userAgent,
  checkedAt: new Date().toISOString(),
  error: null,
});
interface CameraView extends XRView {
  camera?: { width: number; height: number };
}
interface RawBinding {
  getCameraImage?(
    camera: NonNullable<CameraView["camera"]>,
  ): WebGLTexture | null;
  getDepthInformation?(
    view: XRView,
  ): { width: number; height: number; texture: WebGLTexture } | null;
}
export function depthFailure(e: unknown) {
  const name = e instanceof Error ? e.name : "Error";
  if (name === "NotSupportedError")
    return "Depth is unavailable through this browser's AR service. Camera and voice guidance can still work. On Android, use current Chrome and Google Play Services for AR.";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "The browser did not allow the AR depth session. Open the HTTPS app directly in Chrome, allow camera/AR permissions, then tap Check depth again.";
  return e instanceof Error ? e.message : String(e);
}
export class XRProbe {
  private session: XRSession | null = null;
  private generation = 0;
  private cleanup: (() => void) | null = null;
  async start(
    report: ProbeReport,
    update: (r: ProbeReport) => void,
    overlay: HTMLElement,
  ) {
    this.stop();
    const token = this.generation;
    report = {
      ...report,
      phase: "requesting",
      xr: "Requesting AR depth",
      depth: "Waiting for readings",
      depthUsage: "Waiting for session",
      pixels: "Optional raw camera access requested",
      simultaneousFrames: 0,
      validDepthFrames: 0,
      depthBufferFrames: 0,
      poseFrames: 0,
      centreDepthMetres: null,
      dimensions: "—",
      error: null,
      note: "Allow AR access if asked. Move slowly toward a lit, textured surface.",
    };
    const publish = () => {
      if (token === this.generation) update({ ...report });
    };
    publish();
    let session: XRSession;
    try {
      if (!window.isSecureContext)
        throw new Error("AR depth needs HTTPS or localhost.");
      if (!navigator.xr)
        throw new Error(
          "AR depth is unavailable in this browser. Camera and voice guidance can still work.",
        );
      // Request directly from the tap to retain user activation. Missing raw camera
      // access must not mask working depth. Never pair a separate stream with it.
      session = await navigator.xr.requestSession("immersive-ar", {
        requiredFeatures: ["depth-sensing"],
        optionalFeatures: ["camera-access", "dom-overlay"],
        domOverlay: { root: overlay },
        depthSensing: {
          usagePreference: ["cpu-optimized", "gpu-optimized"],
          dataFormatPreference: ["luminance-alpha", "float32"],
        },
      } as XRSessionInit);
    } catch (e) {
      if (token !== this.generation)
        throw new DOMException("Depth check cancelled.", "AbortError");
      report.phase = "unavailable";
      report.xr = "AR depth unavailable";
      report.depth = "No usable depth source";
      report.error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      report.note = depthFailure(e);
      publish();
      throw e;
    }
    if (token !== this.generation) {
      await session.end();
      throw new DOMException("XR test cancelled.", "AbortError");
    }
    this.session = session;
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { xrCompatible: true });
    if (!gl) {
      this.session = null;
      await session.end().catch(() => undefined);
      report.phase = "unavailable";
      report.xr = "AR depth unavailable";
      report.depth = "No usable depth source";
      report.error = "WebGL2 unavailable";
      report.note =
        "This browser cannot render the AR depth check. Camera and voice guidance can still work.";
      publish();
      throw new Error("WebGL2 unavailable.");
    }
    try {
      let ended = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const finish = () => {
        if (ended) return;
        ended = true;
        clearTimeout(timeout);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
        if (token !== this.generation) return;
        this.session = null;
        this.cleanup = null;
        report.phase = "complete";
        report.xr = "Depth check finished";
        report.centreDepthMetres = null;
        report.checkedAt = new Date().toISOString();
        if (!report.depthBufferFrames) {
          report.depth = "No depth readings received";
          report.note = report.error
            ? `Depth could not be read: ${report.error}. Camera and voice remain available.`
            : report.poseFrames
              ? "AR tracked the scene but returned no depth. This browser/runtime did not provide depth during the check. Camera and voice remain available."
              : "AR tracking did not initialize. Use a lit, textured surface and move slowly. Camera and voice remain available.";
        } else if (!report.validDepthFrames) {
          report.note =
            report.depthUsage === "gpu-optimized"
              ? "GPU depth buffers arrived, but this check cannot read metric CPU samples from them. Live object distances remain unavailable."
              : "Depth buffers arrived, but centre samples were invalid or mixed. Live object distances remain unavailable.";
        } else {
          report.note = report.simultaneousFrames
            ? "Depth and readable camera pixels arrived together. Object alignment and measured-distance accuracy still need physical validation. Live object distances remain unavailable."
            : "Depth arrived without verified readable camera pixels. Depth alone cannot give distances to the detector's objects. Live object distances remain unavailable.";
        }
        publish();
      };
      this.cleanup = finish;
      session.addEventListener("end", finish, { once: true });
      await gl.makeXRCompatible();
      if (token !== this.generation || ended)
        throw new DOMException("Depth check cancelled.", "AbortError");
      session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });
      const Binding = (
        window as unknown as {
          XRWebGLBinding: new (
            s: XRSession,
            g: WebGL2RenderingContext,
          ) => RawBinding;
        }
      ).XRWebGLBinding;
      let binding: RawBinding | null = null;
      try {
        if (Binding) binding = new Binding(session, gl);
      } catch {
        // Raw-camera/GPU bindings are optional; CPU depth does not require them.
      }
      const space = await session.requestReferenceSpace("local");
      if (token !== this.generation || ended)
        throw new DOMException("Depth check cancelled.", "AbortError");
      let program: WebGLProgram | null = null;
      let fb: WebGLFramebuffer | null = null;
      let cameraError = "";
      try {
        if (binding?.getCameraImage) {
          const shader = (type: number, source: string) => {
            const s = gl.createShader(type)!;
            gl.shaderSource(s, source);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
              throw new Error(gl.getShaderInfoLog(s) ?? "Shader failed");
            return s;
          };
          program = gl.createProgram()!;
          gl.attachShader(
            program,
            shader(
              gl.VERTEX_SHADER,
              "#version 300 es\nin vec2 p;out vec2 uv;void main(){uv=(p+1.)*.5;gl_Position=vec4(p,0.,1.);}",
            ),
          );
          gl.attachShader(
            program,
            shader(
              gl.FRAGMENT_SHADER,
              "#version 300 es\nprecision mediump float;uniform sampler2D camera;in vec2 uv;out vec4 color;void main(){color=texture(camera,uv);}",
            ),
          );
          gl.linkProgram(program);
          if (!gl.getProgramParameter(program, gl.LINK_STATUS))
            throw new Error("Camera shader link failed.");
          gl.useProgram(program);
          const buffer = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
            gl.STATIC_DRAW,
          );
          const loc = gl.getAttribLocation(program, "p");
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
          const target = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, target);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            64,
            64,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            null,
          );
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          fb = gl.createFramebuffer();
          gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
          gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            target,
            0,
          );
          if (
            gl.checkFramebufferStatus(gl.FRAMEBUFFER) !==
            gl.FRAMEBUFFER_COMPLETE
          )
            throw new Error("Camera readback framebuffer failed.");
        }
      } catch (e) {
        cameraError = e instanceof Error ? e.message : String(e);
      }
      const bytes = new Uint8Array(64 * 64 * 4);
      let last = -Infinity;
      let lastReport = -Infinity;
      report.xr = "Depth check running · ends after 25 seconds";
      report.phase = "running";
      report.depthUsage = session.depthUsage ?? "unreported";
      publish();
      const loop = (time: number, frame: XRFrame) => {
        if (ended || token !== this.generation) return;
        session.requestAnimationFrame(loop);
        if (time - last < 250) return;
        last = time;
        try {
          const pose = frame.getViewerPose(space);
          report.centreDepthMetres = null;
          if (!pose?.views.length) {
            report.depth = "Waiting for AR tracking";
            report.note =
              "Tracking unavailable. Move the phone slowly toward a textured surface.";
            return;
          }
          const view = pose.views[0] as CameraView;
          report.poseFrames++;
          let pixels = false;
          try {
            if (
              view.camera &&
              binding?.getCameraImage &&
              program &&
              fb &&
              !cameraError
            ) {
              const texture = binding.getCameraImage(view.camera);
              if (texture) {
                gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
                gl.viewport(0, 0, 64, 64);
                gl.useProgram(program);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.uniform1i(gl.getUniformLocation(program, "camera"), 0);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                gl.readPixels(0, 0, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
                let min = 255,
                  max = 0;
                for (let i = 0; i < bytes.length; i += 4) {
                  min = Math.min(min, bytes[i]);
                  max = Math.max(max, bytes[i]);
                }
                pixels = gl.getError() === gl.NO_ERROR && max - min > 3;
                report.pixels = pixels
                  ? "Readable image pixels (variation detected)"
                  : "Readback lacks useful variation; aim at a lit scene";
                report.dimensions = `${view.camera.width} × ${view.camera.height}`;
              }
            } else
              report.pixels = cameraError
                ? `Camera readback unavailable: ${cameraError}`
                : "Raw camera access not provided; depth checked independently";
          } catch (e) {
            report.pixels = `Camera readback failed: ${e instanceof Error ? e.message : String(e)}`;
          }
          if (report.depthUsage === "gpu-optimized") {
            const gpuDepth = binding?.getDepthInformation?.(view);
            if (
              gpuDepth?.texture &&
              gpuDepth.width > 0 &&
              gpuDepth.height > 0
            ) {
              report.depthBufferFrames++;
              report.depth =
                "Actual GPU depth buffer received; metric samples unavailable";
            } else report.depth = "No readable GPU depth buffer yet";
          } else {
            const depth = frame.getDepthInformation?.(view);
            if (depth) {
              report.depthBufferFrames++;
              const samples: number[] = [];
              for (const x of [0.4, 0.5, 0.6])
                for (const y of [0.4, 0.5, 0.6])
                  samples.push(depth.getDepthInMeters(x, y));
              const med = depthMedian(samples);
              report.centreDepthMetres = med;
              if (med !== null) {
                report.validDepthFrames++;
                report.depth = "Actual CPU depth received";
                if (pixels) report.simultaneousFrames++;
              } else
                report.depth =
                  "Depth buffer received; centre samples invalid or mixed";
            } else {
              report.depth = "No depth buffer yet";
              report.centreDepthMetres = null;
            }
          }
          report.note =
            "Optional check only: centre readings describe a surface in the AR view, not a detected object's distance. Live sensing uses camera and voice without metres.";
        } catch (e) {
          report.error =
            e instanceof Error ? `${e.name}: ${e.message}` : String(e);
          report.note = report.error;
          report.depth = "Depth reading failed";
        } finally {
          gl.bindFramebuffer(
            gl.FRAMEBUFFER,
            session.renderState.baseLayer?.framebuffer ?? null,
          );
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          if (time - lastReport > 500) {
            publish();
            lastReport = time;
          }
        }
      };
      timeout = setTimeout(
        () => void session.end().catch(() => finish()),
        25000,
      );
      session.requestAnimationFrame(loop);
    } catch (e) {
      if (token === this.generation) {
        this.generation++;
        this.cleanup?.();
        this.cleanup = null;
        this.session = null;
        report.phase = "unavailable";
        report.xr = "AR depth unavailable";
        report.depth = "No usable depth source";
        report.centreDepthMetres = null;
        report.error =
          e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        report.note = depthFailure(e);
        update({ ...report });
      }
      await session.end().catch(() => undefined);
      throw e;
    }
  }
  stop() {
    this.generation++;
    this.cleanup?.();
    this.cleanup = null;
    void this.session?.end().catch(() => undefined);
    this.session = null;
  }
}
