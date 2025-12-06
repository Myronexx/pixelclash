import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { t } from 'ttag';
import { requestUploadBanner, requestMe } from '../store/actions/fetch.js';
import { loginUser } from '../store/actions/index.js';

const BannerUpload = () => {
  const inputRef = useRef();
  const imgRef = useRef();
  const containerRef = useRef();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [imageUrl, setImageUrl] = useState('');
  const [natural, setNatural] = useState([0, 0]);
  const [crop, setCrop] = useState({ x: 0.1, y: 0.1, w: 0.8, h: 0.24 });
  const [dragging, setDragging] = useState(null);
  const [dragMeta, setDragMeta] = useState(null);
  const dispatch = useDispatch();

  const aspect = 10 / 3;

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const openFile = useCallback((e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setStatus(null);
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    const url = URL.createObjectURL(f);
    setImageUrl(url);
  }, [imageUrl]);

  const onImgLoad = useCallback(() => {
    if (!imgRef.current) return;
    const iw = imgRef.current.naturalWidth;
    const ih = imgRef.current.naturalHeight;
    setNatural([iw, ih]);
    const imgAspect = ih / iw;
    let w = 0.9;
    let h = w / (aspect * imgAspect);
    if (h > 0.9) {
      h = 0.9;
      w = h * aspect * imgAspect;
    }
    const x = (1 - w) / 2;
    const y = (1 - h) / 2;
    setCrop({ x, y, w, h });
  }, [aspect]);

  const clampCrop = useCallback((c) => {
    let { x, y, w, h } = c;
    if (w < 0.1) w = 0.1;
    const imgAspect = (natural[1] || 1) / (natural[0] || 1);
    h = w / (aspect * imgAspect);
    if (h > 0.95) { h = 0.95; w = h * aspect * imgAspect; }
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x + w > 1) x = 1 - w;
    if (y + h > 1) y = 1 - h;
    return { x, y, w, h };
  }, [aspect, natural]);

  const getRel = (e, rect) => {
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    return [cx / rect.width, cy / rect.height];
  };

  const startDrag = useCallback((mode, e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const [rx, ry] = getRel(e, rect);
    if (mode === 'move') {
      setDragMeta({ offx: rx - crop.x, offy: ry - crop.y });
    } else {
      if (mode === 'se') setDragMeta({ ax: crop.x, ay: crop.y });
      if (mode === 'nw') setDragMeta({ ax: crop.x + crop.w, ay: crop.y + crop.h });
      if (mode === 'ne') setDragMeta({ ax: crop.x, ay: crop.y + crop.h });
      if (mode === 'sw') setDragMeta({ ax: crop.x + crop.w, ay: crop.y });
    }
    setDragging(mode);
  }, [crop]);
  const stopDrag = useCallback(() => { setDragging(null); setDragMeta(null); }, []);

  const onMove = useCallback((e) => {
    if (!dragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const [rx, ry] = getRel(e, rect);
    if (dragging === 'move' && dragMeta) {
      const nx = rx - dragMeta.offx;
      const ny = ry - dragMeta.offy;
      setCrop((c) => clampCrop({ ...c, x: nx, y: ny }));
      return;
    }
    if (dragMeta) {
      let w;
      let x;
      let y;
      const imgAspect = (natural[1] || 1) / (natural[0] || 1);
      if (dragging === 'se') {
        const dx = rx - dragMeta.ax;
        const dy = ry - dragMeta.ay;
        const wX = Math.abs(dx);
        const wY = Math.abs(dy) * aspect * imgAspect;
        const maxWRight = 1 - dragMeta.ax;
        const maxWDown = (1 - dragMeta.ay) * aspect * imgAspect;
        const maxW = Math.min(maxWRight, maxWDown);
        w = Math.max(0.1, Math.min(Math.max(wX, wY), maxW));
        x = dragMeta.ax;
        y = dragMeta.ay;
      } else if (dragging === 'nw') {
        const dx = dragMeta.ax - rx;
        const dy = dragMeta.ay - ry;
        const wX = Math.abs(dx);
        const wY = Math.abs(dy) * aspect * imgAspect;
        const maxWLeft = dragMeta.ax;
        const maxWUp = dragMeta.ay * aspect * imgAspect;
        const maxW = Math.min(maxWLeft, maxWUp);
        w = Math.max(0.1, Math.min(Math.max(wX, wY), maxW));
        x = dragMeta.ax - w;
        y = dragMeta.ay - (w / (aspect * imgAspect));
      } else if (dragging === 'ne') {
        const dx = rx - dragMeta.ax;
        const dy = dragMeta.ay - ry;
        const wX = Math.abs(dx);
        const wY = Math.abs(dy) * aspect * imgAspect;
        const maxWRight = 1 - dragMeta.ax;
        const maxWUp = dragMeta.ay * aspect * imgAspect;
        const maxW = Math.min(maxWRight, maxWUp);
        w = Math.max(0.1, Math.min(Math.max(wX, wY), maxW));
        x = dragMeta.ax;
        y = dragMeta.ay - (w / (aspect * imgAspect));
      } else if (dragging === 'sw') {
        const dx = dragMeta.ax - rx;
        const dy = ry - dragMeta.ay;
        const wX = Math.abs(dx);
        const wY = Math.abs(dy) * aspect * imgAspect;
        const maxWLeft = dragMeta.ax;
        const maxWDown = (1 - dragMeta.ay) * aspect * imgAspect;
        const maxW = Math.min(maxWLeft, maxWDown);
        w = Math.max(0.1, Math.min(Math.max(wX, wY), maxW));
        x = dragMeta.ax - w;
        y = dragMeta.ay;
      }
      setCrop((c) => clampCrop({ ...c, x, y, w }));
    }
  }, [dragging, dragMeta, clampCrop, aspect, natural]);

  const makeBlob = useCallback(async () => {
    if (!imgRef.current) return null;
    const [nw, nh] = natural;
    const sx = Math.max(0, Math.round(crop.x * nw));
    const sy = Math.max(0, Math.round(crop.y * nh));
    const sw = Math.max(1, Math.round(crop.w * nw));
    const sh = Math.max(1, Math.round(sw / aspect));
    const cw = 1200;
    const ch = 360;
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imgRef.current, sx, sy, sw, sh, 0, 0, cw, ch);
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) { resolve(null); return; }
        resolve(new File([blob], `${Date.now()}.webp`, { type: 'image/webp' }));
      }, 'image/webp', 0.85);
    });
  }, [crop, natural]);

  const submit = useCallback(async () => {
    if (!imageUrl) return;
    setBusy(true);
    setStatus(null);
    const file = await makeBlob();
    if (!file) { setBusy(false); setStatus(t`Processing failed`); return; }
    const res = await requestUploadBanner(file);
    setBusy(false);
    if (res.errors) { setStatus(res.errors[0] || t`Upload failed`); return; }
    try {
      if (res.banner) dispatch({ type: 's/SET_BANNER', banner: res.banner });
      const me = await requestMe();
      if (!me.errors) dispatch(loginUser(me));
    } catch {}
    if (res.version) setVersion(res.version); else setVersion(Date.now());
    setStatus(t`Banner uploaded and saved to your profile`);
    setImageUrl('');
  }, [imageUrl, makeBlob, dispatch]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: '100%' }}>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={openFile} />
      <button type="button" disabled={busy} onClick={() => inputRef.current && inputRef.current.click()}>{busy ? t`Uploading...` : t`Upload Banner`}</button>
      {status && (<div style={{ fontSize: 12, textAlign: 'center', maxWidth: '90%' }}>{status}</div>)}
      {imageUrl && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, pointerEvents: 'auto', touchAction: 'none' }} onWheel={(e) => e.preventDefault()} onTouchMove={(e) => e.preventDefault()}>
          <div style={{ width: 'min(92vw, 860px)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 0, boxShadow: 'none', background: '#fff', border: '1px solid #333' }} onKeyDown={(e) => { if (e.key === 'Escape') { if (imageUrl) URL.revokeObjectURL(imageUrl); setImageUrl(''); } if (e.key === 'Enter') { submit(); } }} tabIndex={0}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>{t`Adjust Banner`}</div>
              <button type="button" onClick={() => { if (imageUrl) URL.revokeObjectURL(imageUrl); setImageUrl(''); }}>✕</button>
            </div>
            <div
              ref={containerRef}
              onMouseMove={onMove}
              onMouseUp={stopDrag}
              onMouseLeave={stopDrag}
              onTouchMove={onMove}
              onTouchEnd={stopDrag}
              style={{ position: 'relative', width: '100%', userSelect: 'none', overflow: 'hidden', borderRadius: 0, background: '#000' }}
            >
              <img ref={imgRef} src={imageUrl} alt="banner-src" onLoad={onImgLoad} style={{ width: '100%', height: 'auto', display: 'block' }} />
              <div
                role="button"
                tabIndex={0}
                onMouseDown={(e) => startDrag('move', e)}
                onTouchStart={(e) => startDrag('move', e)}
                style={{ position: 'absolute', left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%`, outline: '2px solid #fff', boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)', cursor: 'move' }}
              >
                <div
                  onMouseDown={(e) => { e.stopPropagation(); startDrag('nw', e); }}
                  onTouchStart={(e) => { e.stopPropagation(); startDrag('nw', e); }}
                  style={{ position: 'absolute', left: -10, top: -10, width: 20, height: 20, background: '#fff', borderRadius: 0, cursor: 'nwse-resize' }}
                />
                <div
                  onMouseDown={(e) => { e.stopPropagation(); startDrag('ne', e); }}
                  onTouchStart={(e) => { e.stopPropagation(); startDrag('ne', e); }}
                  style={{ position: 'absolute', right: -10, top: -10, width: 20, height: 20, background: '#fff', borderRadius: 0, cursor: 'nesw-resize' }}
                />
                <div
                  onMouseDown={(e) => { e.stopPropagation(); startDrag('sw', e); }}
                  onTouchStart={(e) => { e.stopPropagation(); startDrag('sw', e); }}
                  style={{ position: 'absolute', left: -10, bottom: -10, width: 20, height: 20, background: '#fff', borderRadius: 0, cursor: 'nesw-resize' }}
                />
                <div
                  onMouseDown={(e) => { e.stopPropagation(); startDrag('se', e); }}
                  onTouchStart={(e) => { e.stopPropagation(); startDrag('se', e); }}
                  style={{ position: 'absolute', right: -10, bottom: -10, width: 20, height: 20, background: '#fff', borderRadius: 0, cursor: 'nwse-resize' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button type="button" onClick={() => { if (imageUrl) URL.revokeObjectURL(imageUrl); setImageUrl(''); }}>{t`Cancel`}</button>
              <button type="button" onClick={submit}>{t`Crop & Upload`}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(BannerUpload);
