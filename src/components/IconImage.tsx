import { useEffect, useRef, useState } from "react";
import { loadIcon } from "@iconify/react";
import type { IconifyIcon } from "@iconify/types";
import { buildSvg, DEFAULT_OPTIONS } from "../lib/svg";
import {
  rasterize,
  svgDataUri,
  startNativeFileDrag,
  useThemeColor,
} from "../lib/dragExport";
import { fetchCollection } from "../lib/api";

/**
 * 动态图标检测：Iconify 图标 body 内含 SMIL 动画元素或 CSS 动画声明
 * 即视为动态图标（svg-spinners 用 CSS keyframes，line-md 等用 SMIL）。
 */
export function isAnimatedIcon(data: IconifyIcon): boolean {
  const body = data.body ?? "";
  return /<animate|<animateTransform|<animateMotion|@keyframes|animation\s*:/i.test(
    body,
  );
}

interface IconImageProps {
  name: string; // full "prefix:name"
  size: number;
  className?: string;
  /** 允许图片拖拽（同时传入 dragExport 时才有原生拖拽意义） */
  draggable?: boolean;
  /** 传入完整图标名后，拖拽会走原生文件拖拽导出（macOS NSDraggingSession） */
  dragExport?: string;
}

/**
 * 单个图标渲染：
 * - 静态图标：光栅化为 PNG（拖拽语义最稳，与旧网格行为一致）
 * - 动态图标：直接以 SVG data URI 渲染 <img>——<img> 内 SVG 的声明式动画
 *   （SMIL / CSS keyframes）会自动播放，无需交互；同时保留图片拖拽语义，
 *   且动画样式隔离在图片文档内，不与页面其它内联 SVG 的 id/keyframes 冲突。
 */
export function IconImage({
  name,
  size,
  className,
  draggable,
  dragExport,
}: IconImageProps) {
  const [uri, setUri] = useState("");
  const [animated, setAnimated] = useState(false);
  const svgRef = useRef("");
  const color = useThemeColor();

  useEffect(() => {
    let alive = true;
    setUri("");
    setAnimated(false);
    svgRef.current = "";
    loadIcon(name)
      .then((data) => {
        if (!alive || !data) return;
        const svg = buildSvg(data, DEFAULT_OPTIONS);
        svgRef.current = svg;
        const anim = isAnimatedIcon(data);
        setAnimated(anim);
        if (anim) {
          // 动态图标：烘主题色后用 SVG data URI，动画在 <img> 内自动播放
          if (alive) setUri(svgDataUri(svg, color));
        } else {
          rasterize(svg, color, 128)
            .then((png) => {
              if (alive) setUri(png);
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [name, color]);

  if (!uri) {
    return <span className="cell-icon-ph" style={{ width: size, height: size }} aria-hidden />;
  }
  return (
    <img
      className={className ?? "cell-icon"}
      src={uri}
      width={size}
      height={size}
      alt=""
      draggable={draggable}
      onDragStart={
        dragExport
          ? (e) => startNativeFileDrag(e, svgRef.current, dragExport)
          : undefined
      }
      data-animated={animated || undefined}
    />
  );
}

/**
 * 图标库样本图标条：横排若干个小图标（动态图标自动播放）。
 * 用于侧边栏图标库列表与收藏图标库卡片。
 */
export function IconStrip({
  names,
  size,
  gap = 3,
}: {
  names: string[];
  size: number;
  gap?: number;
}) {
  if (names.length === 0) return null;
  return (
    <span className="icon-strip" style={{ gap }}>
      {names.map((n) => (
        <IconImage key={n} name={n} size={size} className="icon-strip-img" />
      ))}
    </span>
  );
}

/**
 * 指定图标库的前 5 个样本图标条。
 * 优先用 /collections 返回的 samples（零额外请求；裸图标名需补上库前缀）；
 * 无 samples 时拉取该库全量列表取前 5（fetchCollection 有会话级缓存）。
 */
export function CollectionIconStrip({
  prefix,
  samples,
  size,
}: {
  prefix: string;
  samples?: string[];
  size: number;
}) {
  const [names, setNames] = useState<string[]>(() =>
    samples && samples.length > 0 ? samples.slice(0, 5).map((n) => `${prefix}:${n}`) : [],
  );

  useEffect(() => {
    if (samples && samples.length > 0) {
      setNames(samples.slice(0, 5).map((n) => `${prefix}:${n}`));
      return;
    }
    let alive = true;
    fetchCollection(prefix)
      .then((info) => {
        if (alive) setNames(info.icons.slice(0, 5));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [prefix, samples]);

  return <IconStrip names={names} size={size} gap={5} />;
}
