# 地铁站客流 3D 仿真系统

基于 **Vue 3 + TypeScript + Three.js + Vite** 的地铁站客流可视化仿真。

## 功能

- 双层车站：站厅层（入口、7 个闸机、扶梯、楼梯）+ 下层双侧站台、轨道、隧道。
- 乘客从 3 个入口随机生成，经闸机、扶梯/楼梯前往不同站台，在车门位排队候车。
- 两列 4 编组列车按时刻表进站、开门（与站台屏蔽门联动）、上下客、折返循环。
- 下车乘客经付费区、反向闸机从出口离开，客流持续流动。
- 可临时关闭任意闸机或扶梯/楼梯通道，乘客通过 **A\* 寻路自动重新规划路线**，全部封闭时安全等待且不崩溃。
- 实时拥堵热力图（Shader + DataTexture，蓝→绿→黄→红）与乘客状态着色。
- OrbitControls 自由旋转/缩放/平移；点击 3D 场景中的闸机或通道标牌即可开闭。

## 运行

```bash
npm install
npm run dev      # 开发，默认 http://localhost:5173
npm run build    # 类型检查 + 生产构建
npm run preview  # 预览构建产物
```

## 目录结构

- `src/sim/layout.ts`：车站/站台/列车布局常量。
- `src/sim/navgraph.ts`：导航栅格图与二叉堆 A\* 寻路（闸机/通道可封闭）。
- `src/sim/station.ts`：站厅、闸机、扶梯、楼梯、站台、轨道、屏蔽门建模。
- `src/sim/train.ts`：列车运动、车门与状态机。
- `src/sim/passengers.ts`：乘客行为与 InstancedMesh 渲染。
- `src/sim/heatmap.ts`：拥堵热力图。
- `src/sim/simulation.ts`：仿真编排（生成、寻路、换乘、上下车、统计、拾取）。
- `src/components/`：3D 场景与控制台/监测面板。
