// AuctionRoom3D.tsx
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useAuction } from "../hooks/useAuction";
import { useBidder } from "../hooks/useBidder";
import { LotRibbon } from "./LotRibbon";
import { BidPanel } from "./BidPanel";
import { LotDetailOverlay } from "./LotDetailOverlay";
import type { Lot } from "../types/auction";
import "../auction-room.css";

class AuctionScene {
  renderer: any;
  scene: any;
  camera: any;
  clock: any;
  animTime: number = 0;
  currentView: "room" | "lot" | "vr" = "room";
  easelGroup: any;
  easelFrame: any;
  canvasMesh: any;
  currentTexture: any = null;
  lotZoom: number = 0;
  lotZoomTarget: number = 0;
  THREE: any;

  constructor(canvas: HTMLCanvasElement, THREE: any) {
    this.THREE = THREE;
    const T = THREE;
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false;
    this.renderer.setClearColor(0x2a1a0e);
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(
      62,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      100,
    );
    this.camera.position.set(0, 4.5, 12);
    this.camera.lookAt(0, 2.5, -9);
    this.clock = new T.Clock();
    this.buildRoom();
    this.buildPodiumAndAvatar();
    this.buildEasel();
    this.buildSeats();
    this.buildWallArt();
  }

  mat(color: number) {
    return new this.THREE.MeshBasicMaterial({ color });
  }

  buildRoom() {
    const T = this.THREE;
    const floor = new T.Mesh(new T.PlaneGeometry(44, 44), this.mat(0x8b5e3c));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    for (let i = -20; i < 20; i += 0.85) {
      const p = new T.Mesh(new T.PlaneGeometry(44, 0.04), this.mat(0x6b4428));
      p.rotation.x = -Math.PI / 2;
      p.position.set(0, 0.001, i);
      this.scene.add(p);
    }
    [
      [0, 7, -16, 0],
      [0, 7, 11, Math.PI],
      [-16, 7, -2, Math.PI / 2],
      [16, 7, -2, -Math.PI / 2],
    ].forEach((w: number[]) => {
      const wm = new T.Mesh(new T.PlaneGeometry(34, 16), this.mat(0x5c3d2e));
      wm.rotation.y = w[3];
      wm.position.set(w[0], w[1], w[2]);
      this.scene.add(wm);
    });
    const ceil = new T.Mesh(new T.PlaneGeometry(34, 34), this.mat(0x2a2020));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, 14, -2);
    this.scene.add(ceil);
    for (let wp = -13; wp <= 13; wp += 3.4) {
      const pan = new T.Mesh(
        new T.BoxGeometry(3.0, 5.6, 0.09),
        this.mat(0x6b4560),
      );
      pan.position.set(wp, 2.6, -15.9);
      this.scene.add(pan);
    }
    const mol = new T.Mesh(new T.BoxGeometry(34, 0.3, 0.5), this.mat(0xc9a84c));
    mol.position.set(0, 12.2, -15.8);
    this.scene.add(mol);
    const bas = new T.Mesh(
      new T.BoxGeometry(34, 0.35, 0.35),
      this.mat(0x8b6914),
    );
    bas.position.set(0, 0.17, -15.8);
    this.scene.add(bas);
    const carpet = new T.Mesh(new T.PlaneGeometry(3.4, 28), this.mat(0x8b2a42));
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(0, 0.002, 4);
    this.scene.add(carpet);
    const chanBody = new T.Mesh(
      new T.SphereGeometry(0.45, 12, 8),
      this.mat(0xf0d070),
    );
    chanBody.position.set(0, 12.5, -3);
    this.scene.add(chanBody);
  }

  buildPodiumAndAvatar() {
    const T = this.THREE;
    const pod = new T.Mesh(
      new T.BoxGeometry(3.2, 1.5, 1.3),
      this.mat(0x5c2e0a),
    );
    pod.position.set(2.8, 0.75, -10.5);
    this.scene.add(pod);
    const podTop = new T.Mesh(
      new T.BoxGeometry(3.45, 0.12, 1.5),
      this.mat(0x7a4010),
    );
    podTop.position.set(2.8, 1.56, -10.5);
    this.scene.add(podTop);
    const emb = new T.Mesh(new T.PlaneGeometry(1.8, 0.55), this.mat(0xc9a84c));
    emb.position.set(2.8, 0.75, -10.0);
    this.scene.add(emb);
    const avRoot = new T.Group();
    avRoot.position.set(2.8, 1.62, -10.5);
    const screenFrame = new T.Mesh(
      new T.BoxGeometry(1.2, 1.6, 0.08),
      this.mat(0x1a1a1a),
    );
    screenFrame.position.y = 0.8;
    avRoot.add(screenFrame);
    const screenFace = new T.Mesh(
      new T.PlaneGeometry(1.1, 1.5),
      this.mat(0x0a0a30),
    );
    screenFace.position.set(0, 0.8, 0.05);
    avRoot.add(screenFace);
    const labelBar = new T.Mesh(
      new T.BoxGeometry(1.1, 0.18, 0.05),
      this.mat(0xf06a00),
    );
    labelBar.position.set(0, 0.06, 0.06);
    avRoot.add(labelBar);
    const dot = new T.Mesh(
      new T.SphereGeometry(0.04, 8, 8),
      this.mat(0xff6666),
    );
    dot.position.set(-0.42, 0.06, 0.07);
    avRoot.add(dot);
    this.scene.add(avRoot);
  }

  buildEasel() {
    const T = this.THREE;
    this.easelGroup = new T.Group();
    this.easelGroup.position.set(-2.8, 0, -10);
    const legMat = this.mat(0x7a5020);
    const legL = new T.Mesh(new T.BoxGeometry(0.09, 3.6, 0.09), legMat);
    legL.position.set(-0.85, 1.8, 0);
    legL.rotation.z = 0.1;
    this.easelGroup.add(legL);
    const legR = new T.Mesh(new T.BoxGeometry(0.09, 3.6, 0.09), legMat);
    legR.position.set(0.85, 1.8, 0);
    legR.rotation.z = -0.1;
    this.easelGroup.add(legR);
    const legB = new T.Mesh(new T.BoxGeometry(0.09, 3.6, 0.09), legMat);
    legB.position.set(0, 1.8, -0.55);
    legB.rotation.x = -0.22;
    this.easelGroup.add(legB);
    const crossBar = new T.Mesh(new T.BoxGeometry(1.85, 0.09, 0.09), legMat);
    crossBar.position.set(0, 1.25, 0);
    this.easelGroup.add(crossBar);
    this.easelFrame = new T.Mesh(
      new T.BoxGeometry(1.9, 2.4, 0.12),
      this.mat(0xe8c060),
    );
    this.easelFrame.position.set(0, 2.8, 0);
    this.easelGroup.add(this.easelFrame);
    this.canvasMesh = new T.Mesh(
      new T.PlaneGeometry(1.6, 2.0),
      new T.MeshBasicMaterial({ color: 0x1a1208 }),
    );
    this.canvasMesh.position.set(0, 2.8, 0.07);
    this.easelGroup.add(this.canvasMesh);
    const placard = new T.Mesh(
      new T.BoxGeometry(0.85, 0.28, 0.06),
      this.mat(0x1a1410),
    );
    placard.position.set(0, 1.55, 0);
    this.easelGroup.add(placard);
    this.scene.add(this.easelGroup);
  }

  buildSeats() {
    const T = this.THREE;
    const positions: { x: number; z: number }[] = [];
    for (let row = 0; row < 4; row++) {
      for (let s = -3; s <= 3; s++) {
        if (s === 0) continue;
        positions.push({ x: s * 1.65, z: 2.5 + row * 2.3 });
      }
    }
    positions.forEach((pos) => {
      const cg = new T.Group();
      cg.position.set(pos.x, 0, pos.z);
      const seat = new T.Mesh(
        new T.BoxGeometry(0.72, 0.09, 0.72),
        this.mat(0x4a3020),
      );
      seat.position.y = 0.52;
      cg.add(seat);
      const back = new T.Mesh(
        new T.BoxGeometry(0.72, 0.72, 0.07),
        this.mat(0x4a3020),
      );
      back.position.set(0, 0.9, -0.33);
      cg.add(back);
      [
        [-0.29, -0.29],
        [0.29, -0.29],
        [-0.29, 0.29],
        [0.29, 0.29],
      ].forEach(([lx, lz]) => {
        const leg = new T.Mesh(
          new T.BoxGeometry(0.06, 0.52, 0.06),
          this.mat(0x8a5828),
        );
        leg.position.set(lx, 0.26, lz);
        cg.add(leg);
      });
      if (Math.random() > 0.28) {
        const bodyColors = [0x1a2030, 0x201010, 0x102018, 0x201808];
        const skinTones = [0xd4956e, 0xa07048, 0xc49060, 0xb07048];
        const bm = new T.Mesh(
          new T.CylinderGeometry(0.13, 0.16, 0.75, 8),
          this.mat(bodyColors[Math.floor(Math.random() * bodyColors.length)]),
        );
        bm.position.y = 1.1;
        cg.add(bm);
        const hm = new T.Mesh(
          new T.SphereGeometry(0.15, 8, 8),
          this.mat(skinTones[Math.floor(Math.random() * skinTones.length)]),
        );
        hm.position.y = 1.6;
        cg.add(hm);
      }
      this.scene.add(cg);
    });
  }

  buildWallArt() {
    const T = this.THREE;
    const arts = [
      { p: [-13.8, 5.5, -9], r: Math.PI / 2, w: 2.2, h: 1.7, c: 0x4a7aaa },
      { p: [-13.8, 5.5, -4], r: Math.PI / 2, w: 1.5, h: 1.9, c: 0xc07848 },
      { p: [-13.8, 5.5, 1], r: Math.PI / 2, w: 1.9, h: 1.5, c: 0x486090 },
      { p: [13.8, 5.5, -9], r: -Math.PI / 2, w: 1.7, h: 1.9, c: 0x5a8a48 },
      { p: [13.8, 5.5, -4], r: -Math.PI / 2, w: 2.1, h: 1.6, c: 0xa05828 },
      { p: [13.8, 5.5, 1], r: -Math.PI / 2, w: 1.6, h: 2.1, c: 0x3050a0 },
    ];
    arts.forEach((a) => {
      const fr = new T.Mesh(
        new T.BoxGeometry(a.w + 0.26, a.h + 0.26, 0.1),
        this.mat(0xc9a84c),
      );
      fr.rotation.y = a.r;
      fr.position.set(a.p[0], a.p[1], a.p[2]);
      this.scene.add(fr);
      const cv = new T.Mesh(new T.PlaneGeometry(a.w, a.h), this.mat(a.c));
      cv.rotation.y = a.r;
      cv.position.set(a.p[0] + (a.r > 0 ? 0.07 : -0.07), a.p[1], a.p[2]);
      this.scene.add(cv);
    });
  }

  updateEaselTexture(url: string | null) {
    if (!this.canvasMesh) return;
    const T = this.THREE;
    if (this.currentTexture) {
      this.currentTexture.dispose();
      this.currentTexture = null;
    }
    if (!url) {
      this.canvasMesh.material = new T.MeshBasicMaterial({ color: 0x1a1208 });
      return;
    }
    const loader = new T.TextureLoader();
    loader.crossOrigin = "anonymous";
    loader.load(
      url,
      (texture: any) => {
        console.log("EASEL TEXTURE LOADED");
        texture.generateMipmaps = false;
        texture.minFilter = T.LinearFilter;
        texture.flipY = true;
        const maxW = 2.0;
        const maxH = 2.0;
        const aspect = texture.image.width / texture.image.height;
        let w: number, h: number;
        if (aspect >= 1) {
          w = maxW;
          h = maxW / aspect;
        } else {
          h = maxH;
          w = maxH * aspect;
        }
        this.canvasMesh.geometry.dispose();
        this.canvasMesh.geometry = new T.PlaneGeometry(w, h);
        if (this.easelFrame) {
          this.easelFrame.geometry.dispose();
          this.easelFrame.geometry = new T.BoxGeometry(w + 0.3, h + 0.4, 0.12);
        }
        this.currentTexture = texture;
        this.canvasMesh.material = new T.MeshBasicMaterial({ map: texture });
        this.canvasMesh.material.needsUpdate = true;
      },
      undefined,
      (e: any) => console.log("EASEL TEXTURE ERROR", e),
    );
  }

  setView(v: "room" | "lot" | "vr") {
    this.currentView = v;
    if (v === "vr") {
      this.camera.position.set(0, 1.8, 4);
      this.camera.lookAt(0, 2.5, -10);
    }
    if (v !== "lot") {
      this.lotZoom = 0;
      this.lotZoomTarget = 0;
    }
  }

  applyZoomDelta(delta: number) {
    if (this.currentView !== "lot") return;
    this.lotZoomTarget = Math.max(0, Math.min(1, this.lotZoomTarget + delta));
  }

  animate() {
    const delta = this.clock.getDelta();
    this.animTime += delta;
    const t = this.animTime;
    if (this.currentView === "room") {
      this.camera.position.x = Math.sin(t * 0.06) * 1.2;
      this.camera.position.y = 4.5 + Math.sin(t * 0.09) * 0.2;
      this.camera.position.z = 12 + Math.sin(t * 0.04) * 0.6;
      this.camera.lookAt(0, 2.5, -9);
    } else if (this.currentView === "lot") {
      this.lotZoom += (this.lotZoomTarget - this.lotZoom) * 0.08;
      const baseZ = -6.5;
      const zoomedZ = -9.0;
      const camZ = baseZ + (zoomedZ - baseZ) * this.lotZoom;
      const camY = 3.2 - this.lotZoom * 0.3;
      this.camera.position.x =
        -2.8 + Math.sin(t * 0.04) * (0.15 * (1 - this.lotZoom));
      this.camera.position.y = camY + Math.sin(t * 0.06) * 0.03;
      this.camera.position.z = camZ;
      this.camera.lookAt(-2.8, 2.7, -10);
    }
    if (this.easelGroup) {
      this.easelGroup.position.y = Math.sin(t * 0.28) * 0.025;
    }
    this.renderer.render(this.scene, this.camera);
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose() {
    this.currentTexture?.dispose();
    this.renderer.dispose();
  }
}

// ── React component ───────────────────────────────────────
export function AuctionRoom3D() {
  const { saleId } = useParams<{ saleId: string }>();
  const id = saleId ?? import.meta.env.VITE_SALE_ID ?? "";

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<AuctionScene | null>(null);
  const rafRef = useRef<number>(0);
  const [view, setView] = useState<"room" | "lot" | "vr">("room");
  const [activeImageIdx, setIdx] = useState(0);
  const [sceneReady, setSceneReady] = useState(false);

  const {
    auctionState,
    currentLot,
    allLots,
    recentBids,
    nextBidAmount,
    loading,
    error,
    placeBid,
  } = useAuction(id);
  const { bidder, canBid } = useBidder(id);
  const [overlayLot, setOverlayLot] = useState<Lot | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    import("three").then((THREE) => {
      if (!canvasRef.current) return;
      const scene = new AuctionScene(canvasRef.current, THREE);
      sceneRef.current = scene;
      setSceneReady(true);
      const loop = () => {
        scene.animate();
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
    });
    return () => {
      cancelAnimationFrame(rafRef.current);
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (canvasRef.current && sceneRef.current)
        sceneRef.current.resize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!sceneRef.current) return;
      e.preventDefault();
      sceneRef.current.applyZoomDelta(e.deltaY > 0 ? 0.08 : -0.08);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    setIdx(0);
  }, [currentLot?.id]);

  useEffect(() => {
    if (!sceneReady || !sceneRef.current) return;
    const sorted = currentLot?.images
      ? [...currentLot.images].sort((a, b) => a.sort_order - b.sort_order)
      : [];
    const url = sorted[activeImageIdx]?.public_url ?? null;
    sceneRef.current.updateEaselTexture(url);
  }, [sceneReady, currentLot, activeImageIdx]);

  const handleViewChange = useCallback((v: "room" | "lot" | "vr") => {
    if (v === "room") setIdx(0);
    setView(v);
    sceneRef.current?.setView(v);
  }, []);

  const handlePlaceBid = useCallback(
    async (amount: number): Promise<void> => {
      if (!currentLot || !bidder) return;
      await placeBid(currentLot.id, bidder.id, amount, "web");
    },
    [currentLot, bidder, placeBid],
  );

  const handleOverlayBid = useCallback(async () => {
    await handlePlaceBid(nextBidAmount ?? 0);
    setOverlayLot(null);
  }, [handlePlaceBid, nextBidAmount]);

  const sortedImages = currentLot?.images
    ? [...currentLot.images].sort((a, b) => a.sort_order - b.sort_order)
    : [];

  const btnStyle = (v: string): React.CSSProperties => ({
    background: view === v ? "rgba(201,168,76,.4)" : "rgba(0,0,0,.65)",
    border:
      view === v ? "1px solid #C9A84C" : "1px solid rgba(255,255,255,.25)",
    borderRadius: 4,
    padding: "6px 16px",
    fontSize: 12,
    fontWeight: 600,
    color: view === v ? "#C9A84C" : "rgba(255,255,255,.75)",
    cursor: "pointer",
    fontFamily: "DM Sans, sans-serif",
    whiteSpace: "nowrap",
  });

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "#2a1a0e",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      />

      {/* Top bar */}
      <div
        className="auction-topbar"
        style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 }}
      >
        <div className="auction-topbar__logo">BENSON AUCTION SERVICES</div>
        <div className="auction-topbar__title">
          {auctionState
            ? `LOT ${currentLot?.lot_number ?? "—"} OF ${allLots.length} · Fine Arts Winter Collection`
            : loading
              ? "Connecting…"
              : "Live Auction"}
        </div>
        <div className="auction-topbar__live">
          <span className="auction-topbar__dot" />
          LIVE
        </div>
      </div>

      {/* View toggle */}
      <div
        style={{
          position: "absolute",
          top: 44,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: 6,
          zIndex: 10,
        }}
      >
        <button
          style={btnStyle("room")}
          onClick={() => handleViewChange("room")}
        >
          🏛 Room
        </button>
        <button style={btnStyle("lot")} onClick={() => handleViewChange("lot")}>
          🖼 Close-up
        </button>
        <button style={btnStyle("vr")} onClick={() => handleViewChange("vr")}>
          🥽 VR
        </button>
      </div>

      {/* Bid panel */}
      {view !== "vr" && (
        <div
          style={{
            position: "absolute",
            left: 14,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 10,
          }}
        >
          <BidPanel
            auctionState={auctionState}
            currentLot={currentLot}
            recentBids={recentBids}
            nextBidAmount={nextBidAmount}
            bidder={bidder}
            canBid={canBid}
            onPlaceBid={handlePlaceBid}
          />
        </div>
      )}

      {/* Lot info panel */}
      {view !== "vr" && currentLot && (
        <div
          style={{
            position: "absolute",
            right: 14,
            top: "50%",
            transform: "translateY(-50%)",
            width: 200,
            background: "rgba(255,255,255,0.94)",
            borderRadius: 7,
            overflow: "hidden",
            boxShadow: "0 6px 28px rgba(0,0,0,.55)",
            zIndex: 10,
          }}
        >
          <div className="ip-header">
            <div className="ip-lot-tag">LOT {currentLot.lot_number} ★</div>
            <div className="ip-title">{currentLot.title}</div>
            {currentLot.estimate_low && currentLot.estimate_high && (
              <div className="ip-est">
                Est ${currentLot.estimate_low.toLocaleString()} – $
                {currentLot.estimate_high.toLocaleString()}
              </div>
            )}
            {currentLot.status === "open" && <div className="ip-now">NOW!</div>}
          </div>
          <div className="ip-body">
            {currentLot.artist && (
              <div className="ip-section">
                <div className="ip-label">Artist</div>
                <div className="ip-text">{currentLot.artist}</div>
              </div>
            )}
            <div className="ip-grid">
              {currentLot.medium && (
                <div className="ip-cell">
                  <div className="ip-cell-label">Medium</div>
                  <div className="ip-cell-val">{currentLot.medium}</div>
                </div>
              )}
              {currentLot.dimensions && (
                <div className="ip-cell">
                  <div className="ip-cell-label">Size</div>
                  <div className="ip-cell-val">{currentLot.dimensions}</div>
                </div>
              )}
              {currentLot.condition_report && (
                <div className="ip-cell">
                  <div className="ip-cell-label">Condition</div>
                  <div className="ip-cell-val">
                    {currentLot.condition_report}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Vertical image ribbon — close-up only */}
      {view === "lot" && sortedImages.length > 1 && (
        <div
          style={{
            position: "absolute",
            right: 224,
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            zIndex: 10,
            background: "rgba(0,0,0,.55)",
            borderRadius: 6,
            padding: "6px 5px",
            border: "1px solid rgba(201,168,76,.25)",
          }}
        >
          {sortedImages.map((img, idx) => (
            <button
              key={img.id}
              onClick={() => setIdx(idx)}
              style={{
                width: 64,
                height: 54,
                borderRadius: 4,
                padding: 0,
                border:
                  idx === activeImageIdx
                    ? "2px solid #cc2200"
                    : "2px solid rgba(255,255,255,.2)",
                overflow: "hidden",
                cursor: "pointer",
                background: "#1a1208",
                transform: idx === activeImageIdx ? "scale(1.05)" : "scale(1)",
                transition: "all .15s",
              }}
            >
              {img.public_url ? (
                <img
                  src={img.public_url}
                  alt={img.caption ?? `View ${idx + 1}`}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span
                  style={{
                    fontSize: 22,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                  }}
                >
                  🖼
                </span>
              )}
            </button>
          ))}
          <div
            style={{
              fontSize: 9,
              color: "rgba(255,255,255,.4)",
              textAlign: "center",
              marginTop: 2,
              lineHeight: 1.4,
            }}
          >
            Scroll to
            <br />
            zoom
          </div>
        </div>
      )}

      {/* VR auctioneer call */}
      {view === "vr" && auctionState?.auctioneer_call && (
        <div
          style={{
            position: "absolute",
            bottom: 110,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0,0,0,.68)",
            border: "1px solid rgba(201,168,76,.4)",
            borderRadius: 5,
            padding: "7px 12px",
            fontSize: 13,
            color: "rgba(255,240,200,.9)",
            fontStyle: "italic",
            maxWidth: 320,
            textAlign: "center",
            zIndex: 10,
          }}
        >
          <span
            style={{
              display: "block",
              fontSize: 10,
              fontStyle: "normal",
              fontWeight: 700,
              color: "#C9A84C",
              marginBottom: 3,
            }}
          >
            🔨 AUCTIONEER
          </span>
          "{auctionState.auctioneer_call}"
        </div>
      )}

      {/* Lot ribbon */}
      <div
        style={{
          position: "absolute",
          bottom: 14,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
        }}
      >
        <LotRibbon
          lots={allLots}
          activeLotId={auctionState?.current_lot_id ?? null}
          onLotClick={setOverlayLot}
        />
      </div>

      {/* Watching count */}
      <div
        style={{
          position: "absolute",
          bottom: 14,
          left: 14,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 5,
          background: "rgba(0,0,0,.62)",
          border: "1px solid rgba(255,255,255,.15)",
          borderRadius: 4,
          padding: "4px 10px",
        }}
      >
        <div
          style={{
            width: 5,
            height: 5,
            background: "#7fff6a",
            borderRadius: "50%",
          }}
        />
        <span style={{ fontSize: 10, color: "rgba(255,255,255,.65)" }}>
          {auctionState?.watching_count ?? 0} watching
        </span>
      </div>

      {loading && (
        <div
          className="auction-loading"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            background: "rgba(10,8,4,.85)",
          }}
        >
          <div className="auction-loading__spinner" />
          <p>Connecting to live auction…</p>
        </div>
      )}

      {error && (
        <div
          className="auction-error"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            background: "rgba(10,8,4,.85)",
          }}
        >
          <p>⚠ Could not connect: {error}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      )}

      {overlayLot && (
        <LotDetailOverlay
          lot={overlayLot}
          auctionState={auctionState}
          nextBidAmount={nextBidAmount}
          canBid={canBid}
          onBid={handleOverlayBid}
          onClose={() => setOverlayLot(null)}
        />
      )}
    </div>
  );
}
