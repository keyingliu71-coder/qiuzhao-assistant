"use client";

import { useState } from "react";
import ApplicationViz, { VizApp } from "./ApplicationViz";

// 驾驶舱「今日投递」卡片的可视化弹窗：默认不展示，点图标弹出全量投递可视化
export default function DeliveryVizModal({ apps }: { apps: VizApp[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="viz-trigger-btn"
        title="查看全部投递可视化"
        onClick={() => setOpen(true)}
      >
        📊 全部投递
      </button>
      {open && (
        <div
          className={"modal-mask open"}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="modal in" style={{ maxWidth: 920, maxHeight: "88vh" }}>
            <div className="modal-head">
              <h2>投递进度可视化</h2>
              <span style={{ flex: 1 }}></span>
              <button className="close-btn" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body" style={{ overflow: "auto", maxHeight: "82vh" }}>
              <ApplicationViz apps={apps} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}