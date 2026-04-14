export const CSS = `
.durag-root{background:#06060c;color:#fff;font-family:system-ui,-apple-system,sans-serif;width:100%;min-height:100%;position:relative;}
.durag-root *,.durag-root *::before,.durag-root *::after{margin:0;padding:0;box-sizing:border-box;}
.durag-root canvas{display:block;}

.durag-upload{position:absolute;inset:0;background:#06060c;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:100;transition:opacity 0.8s ease;}
.durag-upload.fade-out{opacity:0;pointer-events:none;}
.durag-upload .logo{font-family:monospace;font-size:42px;color:#fff;text-shadow:0 0 20px rgba(124,58,237,0.6),0 0 60px rgba(124,58,237,0.2);letter-spacing:-1px;margin-bottom:6px;}
.durag-upload .tagline{color:#7c3aed;font-size:12px;font-family:monospace;letter-spacing:3px;text-transform:uppercase;margin-bottom:48px;}
.durag-drop-zone{width:400px;height:200px;border:1px dashed #2a2a3a;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;transition:all 0.25s ease;position:relative;}
.durag-drop-zone:hover,.durag-drop-zone.drag-over{border-color:#7c3aed;background:rgba(124,58,237,0.05);}
.durag-drop-zone .dz-icon{font-size:32px;color:#2a2a3a;margin-bottom:12px;transition:color 0.2s;}
.durag-drop-zone:hover .dz-icon{color:#7c3aed;}
.durag-drop-zone .dz-text{color:#6b7280;font-size:14px;font-family:monospace;}
.durag-drop-zone .dz-sub{color:#3a3a4a;font-size:11px;font-family:monospace;margin-top:8px;}
.durag-drop-zone input{position:absolute;inset:0;opacity:0;cursor:pointer;}

.durag-processing{position:absolute;inset:0;background:#06060c;display:none;flex-direction:column;align-items:center;justify-content:center;z-index:99;transition:opacity 0.8s ease;}
.durag-processing.fade-out{opacity:0;pointer-events:none;}
.durag-processing .logo{font-family:monospace;font-size:32px;color:#fff;text-shadow:0 0 20px rgba(124,58,237,0.5);margin-bottom:8px;}
.durag-processing .tagline{color:#7c3aed;font-size:11px;font-family:monospace;letter-spacing:2px;text-transform:uppercase;margin-bottom:32px;}
.durag-progress-wrap{width:240px;height:2px;background:#1a1a2a;overflow:hidden;}
.durag-progress-bar{height:100%;width:0%;background:linear-gradient(90deg,#7c3aed,#a78bfa);transition:width 0.15s ease;}
.durag-progress-text{color:#4a4a5a;font-size:11px;margin-top:14px;font-family:monospace;}
.durag-file-info{color:#3a3a4a;font-size:11px;font-family:monospace;margin-bottom:24px;}
.durag-error{color:#f87171;font-size:13px;margin-top:16px;display:none;}

.durag-dash{display:none;min-height:100%;background:#06060c;padding:0 0 60px 0;}
.durag-topbar{display:flex;align-items:center;justify-content:space-between;padding:20px 32px;border-bottom:1px solid #111;position:sticky;top:0;background:#06060c;z-index:30;}
.durag-topbar .logo{font-family:monospace;font-size:18px;color:#fff;text-shadow:0 0 10px rgba(124,58,237,0.4);}
.durag-topbar .tag{font-family:monospace;font-size:9px;color:#7c3aed;letter-spacing:2px;text-transform:uppercase;margin-top:1px;}
.durag-btn{background:rgba(124,58,237,0.15);border:1px solid #7c3aed;color:#a78bfa;padding:8px 20px;font-size:13px;font-family:monospace;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;gap:8px;}
.durag-btn:hover{background:rgba(124,58,237,0.3);color:#fff;}
.durag-btn-ghost{background:none;border:1px solid #2a2a3a;color:#6b7280;padding:6px 14px;font-size:11px;}
.durag-content{max-width:1100px;margin:0 auto;padding:32px;}

.durag-hero{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:32px;}
.durag-stat{background:#0c0c14;border:1px solid #1a1a2a;padding:24px;transition:border-color 0.2s;}
.durag-stat:hover{border-color:#2a2a3a;}
.durag-stat .s-label{font-size:11px;font-family:monospace;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;}
.durag-stat .s-value{font-size:28px;font-weight:600;color:#fff;font-family:monospace;line-height:1.2;}
.durag-stat .s-sub{font-size:12px;color:#4a4a5a;font-family:monospace;margin-top:6px;}
.durag-stat.risk .s-value{color:#f87171;}
.durag-stat.risk{border-color:rgba(248,113,113,0.2);}

.durag-section{font-size:13px;font-family:monospace;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px;margin-top:8px;}
.durag-segments{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;margin-bottom:40px;}
.durag-seg{background:#0c0c14;border:1px solid #1a1a2a;padding:18px 20px;cursor:pointer;transition:all 0.2s;position:relative;overflow:hidden;}
.durag-seg:hover{border-color:#3a3a4a;background:#0e0e18;}
.durag-seg .seg-header{display:flex;align-items:center;gap:10px;margin-bottom:10px;}
.durag-seg .seg-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;}
.durag-seg .seg-name{font-size:14px;font-weight:500;color:#fff;}
.durag-seg .seg-count{font-size:12px;color:#6b7280;font-family:monospace;margin-left:auto;}
.durag-seg .seg-stats{display:flex;gap:20px;margin-bottom:10px;}
.durag-seg .seg-stat{display:flex;flex-direction:column;}
.durag-seg .ss-val{font-size:16px;font-weight:500;color:#fff;font-family:monospace;}
.durag-seg .ss-label{font-size:10px;color:#6b7280;font-family:monospace;text-transform:uppercase;letter-spacing:0.5px;}
.durag-seg .seg-bar{height:3px;background:#1a1a2a;margin-top:4px;}
.durag-seg .seg-bar-fill{height:100%;background:#7c3aed;transition:width 0.5s ease;}
.durag-seg .seg-trait{font-size:11px;color:#4a4a5a;font-family:monospace;margin-top:8px;}
.durag-seg .seg-insights{margin-top:12px;border-top:1px solid #1a1a2a;padding-top:10px;display:flex;flex-direction:column;gap:6px;}
.durag-seg .seg-insight{font-size:11px;color:#9ca3af;line-height:1.5;padding-left:10px;border-left:2px solid #2a2a3a;}
.durag-seg.at-risk{border-color:rgba(248,113,113,0.2);}
.durag-seg.at-risk .seg-name{color:#f87171;}
.durag-seg.at-risk .seg-insight{border-left-color:rgba(248,113,113,0.3);}

.durag-table-wrap{overflow-x:auto;}
.durag-search{background:#0c0c14;border:1px solid #1a1a2a;color:#fff;padding:8px 14px;font-family:monospace;font-size:12px;width:280px;margin-bottom:16px;outline:none;transition:border-color 0.2s;}
.durag-search:focus{border-color:#7c3aed;}
.durag-search::placeholder{color:#3a3a4a;}
table.durag-table{width:100%;border-collapse:collapse;font-family:monospace;font-size:12px;}
table.durag-table th{text-align:left;padding:10px 12px;color:#6b7280;font-weight:400;text-transform:uppercase;letter-spacing:0.5px;font-size:10px;border-bottom:1px solid #1a1a2a;cursor:pointer;user-select:none;white-space:nowrap;}
table.durag-table th:hover{color:#fff;}
table.durag-table td{padding:8px 12px;border-bottom:1px solid #0e0e18;color:#ccc;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
table.durag-table tr{transition:background 0.15s;cursor:pointer;}
table.durag-table tr:hover{background:#0e0e18;}
.durag-pill{display:inline-block;padding:2px 8px;border-radius:8px;font-size:10px;color:#000;font-weight:500;}

.durag-3d{display:none;position:absolute;inset:0;z-index:50;background:#06060c;}
.durag-3d .back-btn{position:absolute;top:20px;left:24px;z-index:60;}
.durag-3d-hud{position:absolute;top:20px;right:24px;display:flex;align-items:center;gap:8px;z-index:60;flex-wrap:wrap;justify-content:flex-end;max-width:500px;}
.durag-3d-hud .label{color:#6b7280;font-size:12px;font-family:monospace;margin-right:4px;}
.durag-3d-hud button{background:transparent;border:1px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.6);padding:5px 12px;font-size:11px;font-family:monospace;cursor:pointer;transition:all 0.2s ease;}
.durag-3d-hud button:hover{border-color:rgba(255,255,255,0.4);color:#fff;}
.durag-3d-hud button.active{background:rgba(124,58,237,0.3);color:#fff;border-color:#7c3aed;}
.durag-3d-legend{position:absolute;bottom:24px;left:24px;display:flex;flex-direction:column;gap:5px;z-index:60;}
.durag-3d-legend .item{display:flex;align-items:center;gap:8px;font-size:11px;font-family:monospace;color:#6b7280;}
.durag-3d-legend .dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
.durag-3d-info{position:absolute;bottom:24px;left:50%;transform:translateX(-50%);font-size:10px;font-family:monospace;color:#2a2a3a;z-index:60;}

.durag-inspector{position:absolute;top:0;right:0;width:300px;height:100%;background:rgba(12,12,20,0.97);border-left:1px solid #2a2a3a;z-index:70;transform:translateX(100%);transition:transform 0.25s ease;overflow-y:auto;padding:20px;}
.durag-inspector.open{transform:translateX(0);}
.durag-inspector .close-btn{position:absolute;top:12px;right:12px;background:none;border:none;color:#6b7280;font-size:18px;cursor:pointer;line-height:1;}
.durag-inspector .close-btn:hover{color:#fff;}
.durag-inspector .company-name{font-size:17px;font-weight:600;color:#fff;margin-bottom:8px;padding-right:24px;}
.durag-inspector .cluster-badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-family:monospace;font-weight:500;margin-bottom:16px;}
.durag-inspector .divider{height:1px;background:#2a2a3a;margin:12px 0;}
.durag-inspector .field{display:flex;justify-content:space-between;align-items:center;padding:5px 0;font-size:12px;}
.durag-inspector .field .key{color:#6b7280;font-family:monospace;max-width:120px;overflow:hidden;text-overflow:ellipsis;}
.durag-inspector .field .value{color:#fff;text-align:right;font-family:monospace;max-width:150px;overflow:hidden;text-overflow:ellipsis;}
`;
