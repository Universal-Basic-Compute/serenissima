'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Venice center used as the local origin for lat/lng -> meters conversion
const ORIGIN = { lat: 45.4337, lng: 12.3269 };
const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LNG = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180);

function toXZ(lat: number, lng: number): [number, number] {
  return [(lng - ORIGIN.lng) * M_PER_DEG_LNG, -(lat - ORIGIN.lat) * M_PER_DEG_LAT];
}

const CATEGORY_STYLE: Record<string, { color: number; height: number }> = {
  business: { color: 0xb08a5a, height: 11 },
  home: { color: 0xc9a887, height: 9 },
  public: { color: 0xd8cfc0, height: 14 },
  religious: { color: 0xe8e0d0, height: 18 },
  military: { color: 0x8a8578, height: 12 },
};

const CLASS_COLOR: Record<string, number> = {
  Nobili: 0xd4af37,
  Cittadini: 0x9b59b6,
  Popolani: 0x3498db,
  Facchini: 0x95a5a6,
  Artisti: 0xe74c3c,
  Clero: 0xecf0f1,
  Scientisti: 0x1abc9c,
  Innovatori: 0xe67e22,
  Forestieri: 0x2ecc71,
  Ambasciatore: 0xc0392b,
};

type CitizenEntry = {
  username: string;
  name: string;
  socialClass: string;
  ducats: number;
  hasPosition: boolean;
};

export default function Venice3DPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Chargement de la lagune…');
  const [hovered, setHovered] = useState<string | null>(null);
  const [citizens, setCitizens] = useState<CitizenEntry[]>([]);
  const [search, setSearch] = useState('');
  const [panelOpen, setPanelOpen] = useState(true);
  const [selected, setSelected] = useState<CitizenEntry | null>(null);
  const [thought, setThought] = useState<string | null>(null);

  const markersRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const selectedMarkerRef = useRef<THREE.Mesh | null>(null);
  const flyRef = useRef<{
    fromPos: THREE.Vector3; toPos: THREE.Vector3;
    fromLook: THREE.Vector3; toLook: THREE.Vector3; t: number;
  } | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? citizens.filter(c => c.name.toLowerCase().includes(q) || c.username.toLowerCase().includes(q) || c.socialClass.toLowerCase().includes(q))
      : citizens;
    return [...list].sort((a, b) => b.ducats - a.ducats);
  }, [citizens, search]);

  function flyToCitizen(entry: CitizenEntry) {
    setSelected(entry);
    setThought(null);
    fetch(`/api/thoughts?citizenUsername=${encodeURIComponent(entry.username)}&limit=1`)
      .then(r => r.json())
      .then(d => setThought(d?.thoughts?.[0]?.mainThought ?? null))
      .catch(() => setThought(null));

    const marker = markersRef.current.get(entry.username);
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!marker || !camera || !controls) return;

    // Reset previous highlight, apply new one
    const prev = selectedMarkerRef.current;
    if (prev) {
      prev.scale.setScalar(1);
      (prev.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.35;
    }
    selectedMarkerRef.current = marker;
    (marker.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2;

    const p = marker.position;
    const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
    flyRef.current = {
      fromPos: camera.position.clone(),
      toPos: new THREE.Vector3(p.x + dir.x * 90 + 25, p.y + 55, p.z + dir.z * 90 + 25),
      fromLook: controls.target.clone(),
      toLook: p.clone(),
      t: 0,
    };
  }

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e1a26);
    scene.fog = new THREE.Fog(0x0e1a26, 1500, 4200);

    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 1, 10000);
    camera.position.set(0, 900, 1100);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.minDistance = 40;
    controls.maxDistance = 3500;
    controlsRef.current = controls;

    scene.add(new THREE.HemisphereLight(0xbfd4e6, 0x2a2118, 0.75));
    const sun = new THREE.DirectionalLight(0xffe0b0, 1.6);
    sun.position.set(-900, 700, 400);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const d = 1600;
    Object.assign(sun.shadow.camera, { left: -d, right: d, top: d, bottom: -d, far: 4000 });
    scene.add(sun);

    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x1d4e5f, roughness: 0.25, metalness: 0.55, transparent: true, opacity: 0.94,
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.receiveShadow = true;
    scene.add(water);

    const pickables: THREE.Object3D[] = [];
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const abort = new AbortController();

    async function build() {
      const [polyRes, bldRes, citRes] = await Promise.all([
        fetch('/api/get-polygons', { signal: abort.signal }).then(r => r.json()),
        fetch('/api/buildings', { signal: abort.signal }).then(r => r.json()),
        fetch('/api/citizens', { signal: abort.signal }).then(r => r.json()).catch(() => ({ citizens: [] })),
      ]);
      if (disposed) return;

      const islandMat = new THREE.MeshStandardMaterial({ color: 0xb5a98c, roughness: 0.9 });
      const quayMat = new THREE.MeshStandardMaterial({ color: 0x9a8f76, roughness: 0.95 });
      for (const poly of polyRes.polygons ?? []) {
        const ring: { lat: number; lng: number }[] = poly.coordinates ?? [];
        if (ring.length < 3) continue;
        const shape = new THREE.Shape();
        ring.forEach((c, i) => {
          const [x, z] = toXZ(c.lat, c.lng);
          if (i === 0) shape.moveTo(x, -z);
          else shape.lineTo(x, -z);
        });
        const geo = new THREE.ExtrudeGeometry(shape, { depth: 2.4, bevelEnabled: false });
        geo.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geo, Math.random() < 0.25 ? quayMat : islandMat);
        mesh.position.y = 0.2;
        mesh.receiveShadow = true;
        mesh.userData.label = poly.historicalName || poly.englishName || poly.id;
        pickables.push(mesh);
        scene.add(mesh);
      }
      setStatus('Îles levées — construction des bâtiments…');

      const roofMat = new THREE.MeshStandardMaterial({ color: 0xa0522d, roughness: 0.8 });
      const buildings = bldRes.buildings ?? [];
      for (const b of buildings) {
        const pos = b.position;
        if (!pos?.lat || !pos?.lng) continue;
        const style = CATEGORY_STYLE[b.category] ?? { color: 0xbfae90, height: 10 };
        const h = style.height * (0.8 + Math.random() * 0.5);
        const w = 9 + Math.random() * 6;
        const [x, z] = toXZ(pos.lat, pos.lng);
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, w),
          new THREE.MeshStandardMaterial({ color: style.color, roughness: 0.85 })
        );
        body.position.set(x, h / 2 + 2.4, z);
        body.rotation.y = ((b.rotation ?? 0) * Math.PI) / 180;
        body.castShadow = true;
        body.receiveShadow = true;
        body.userData.label = `${b.name ?? b.type} (${b.category ?? '?'})`;
        pickables.push(body);
        scene.add(body);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.78, h * 0.35, 4), roofMat);
        roof.position.set(x, h + 2.4 + h * 0.175, z);
        roof.rotation.y = body.rotation.y + Math.PI / 4;
        roof.castShadow = true;
        scene.add(roof);
      }
      setStatus('Bâtiments dressés — arrivée des citoyens…');

      const list: CitizenEntry[] = [];
      let placed = 0;
      for (const c of citRes.citizens ?? []) {
        let p = c.position;
        if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = null; } }
        const entry: CitizenEntry = {
          username: c.username ?? '?',
          name: `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || (c.username ?? '?'),
          socialClass: c.socialClass ?? '?',
          ducats: Math.round(c.ducats ?? 0),
          hasPosition: !!(p?.lat && p?.lng),
        };
        list.push(entry);
        if (!entry.hasPosition) continue;
        const [x, z] = toXZ(p.lat, p.lng);
        const color = CLASS_COLOR[entry.socialClass] ?? 0xffffff;
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(2.2, 12, 12),
          new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35 })
        );
        marker.position.set(x, 5.6, z);
        marker.userData.label = `${entry.name} — ${entry.socialClass}`;
        markersRef.current.set(entry.username, marker);
        pickables.push(marker);
        scene.add(marker);
        placed++;
      }
      setCitizens(list);
      setStatus(`${(polyRes.polygons ?? []).length} îles · ${buildings.length} bâtiments · ${placed} citoyens`);
    }

    build().catch(e => { if (!disposed) setStatus(`Erreur de chargement: ${e.message}`); });

    function onPointerMove(e: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }
    renderer.domElement.addEventListener('pointermove', onPointerMove);

    let frame = 0;
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      frame++;

      const fly = flyRef.current;
      if (fly) {
        fly.t = Math.min(1, fly.t + 0.02);
        const e = 1 - Math.pow(1 - fly.t, 3); // ease-out cubic
        camera.position.lerpVectors(fly.fromPos, fly.toPos, e);
        controls.target.lerpVectors(fly.fromLook, fly.toLook, e);
        if (fly.t >= 1) flyRef.current = null;
      }
      controls.update();

      water.position.y = Math.sin(frame * 0.015) * 0.18;
      const sel = selectedMarkerRef.current;
      if (sel) sel.scale.setScalar(1.6 + Math.sin(frame * 0.1) * 0.45);

      if (frame % 6 === 0 && pickables.length) {
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(pickables, false)[0];
        setHovered(hit ? (hit.object.userData.label as string) : null);
      }
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      disposed = true;
      abort.abort();
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      markersRef.current.clear();
      scene.traverse(o => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach(x => x.dispose());
        else mat?.dispose();
      });
    };
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0e1a26]">
      <div ref={mountRef} className="absolute inset-0" />

      <div className="absolute top-4 left-4 text-amber-100 font-serif pointer-events-none select-none">
        <h1 className="text-2xl tracking-wide" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
          La Serenissima — Vue 3D
        </h1>
        <p className="text-sm text-amber-200/80">{status}</p>
        <p className="text-xs text-amber-200/60 mt-1">clic gauche : orbite · molette : zoom · clic droit : déplacement</p>
      </div>

      {/* Citizen navigator */}
      <div className={`absolute top-0 right-0 h-full flex transition-transform duration-300 ${panelOpen ? '' : 'translate-x-[280px]'}`}>
        <button
          onClick={() => setPanelOpen(o => !o)}
          className="self-center -ml-6 w-6 h-16 rounded-l bg-black/70 text-amber-100 text-xs hover:bg-black/90"
          title={panelOpen ? 'Masquer' : 'Citoyens'}
        >
          {panelOpen ? '»' : '«'}
        </button>
        <div className="w-[280px] h-full bg-black/75 backdrop-blur-sm border-l border-amber-900/40 flex flex-col">
          <div className="p-3 border-b border-amber-900/40">
            <h2 className="text-amber-100 font-serif text-lg mb-2">Citoyens ({citizens.length})</h2>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Chercher nom, classe…"
              className="w-full px-2 py-1.5 rounded bg-white/10 text-amber-50 text-sm placeholder-amber-200/40 outline-none focus:bg-white/15"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.map(c => (
              <button
                key={c.username}
                onClick={() => c.hasPosition && flyToCitizen(c)}
                disabled={!c.hasPosition}
                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-amber-100/10 ${
                  selected?.username === c.username ? 'bg-amber-100/15' : ''
                } ${c.hasPosition ? '' : 'opacity-40 cursor-not-allowed'}`}
              >
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: `#${(CLASS_COLOR[c.socialClass] ?? 0xffffff).toString(16).padStart(6, '0')}` }}
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-amber-50 text-sm truncate">{c.name}</span>
                  <span className="block text-amber-200/50 text-[11px]">{c.socialClass} · {c.ducats.toLocaleString('fr-FR')} ⚜</span>
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-amber-200/50 text-sm p-3">Aucun citoyen ne correspond.</p>
            )}
          </div>
        </div>
      </div>

      {/* Selected citizen card */}
      {selected && (
        <div className="absolute bottom-6 left-4 max-w-md rounded-lg bg-black/80 border border-amber-900/50 p-4 text-amber-50">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-serif text-lg leading-tight">{selected.name}</h3>
              <p className="text-amber-200/70 text-xs">{selected.socialClass} · {selected.ducats.toLocaleString('fr-FR')} ducats · @{selected.username}</p>
            </div>
            <button onClick={() => setSelected(null)} className="text-amber-200/60 hover:text-amber-100">✕</button>
          </div>
          {thought !== null ? (
            <p className="mt-2 text-sm italic text-amber-100/90 leading-snug">« {thought} »</p>
          ) : (
            <p className="mt-2 text-xs text-amber-200/40">…pensée en cours de récupération…</p>
          )}
        </div>
      )}

      {hovered && !selected && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded bg-black/70 text-amber-100 text-sm pointer-events-none">
          {hovered}
        </div>
      )}

      <a href="/" className="absolute top-4 right-[300px] px-3 py-1.5 rounded bg-black/60 text-amber-100 text-sm hover:bg-black/80">
        ← carte 2D
      </a>
    </div>
  );
}
