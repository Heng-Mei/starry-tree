# starry-tree

以梵高《星月夜》（1889）的构图、笔触和配色画出的一幅会动的油画，画里的柏树就是圣诞树。左右拖拽可以转动这棵树，转到某个角度时，树上的灯会连成两个字。

https://heng-mei.github.io/starry-tree/

## 本地运行

```sh
python3 -m http.server 8123   # http://localhost:8123
npm test                      # 字形放置的 Node 测试
```

无构建步骤。three.js r187 放在 `vendor/`。

开发用的 URL 参数：
- `?t=30`：跳过开场
- `?yaw=140`：设置初始角度（度）
- `?tier=0|1|2`：指定画质档

重新烘焙 `assets/starry-map.png`：

```sh
uv run --with pillow --with numpy --with scipy python tools/bake-map.py starry.jpg
```

## 已知取舍

- 只有树能转，天空是固定远景。
- 天空流动是笔触沿烘焙方向往返漂移加淡入淡出，不是真正的流体。
- 行书骨架靠手调。
- 只支持 WebGL2。

设计：`docs/superpowers/specs/2026-11-20-starry-tree-design.md`

画作为公有领域，取色来源是维基共享资源的 Google Art Project 扫描图。three.js 采用 MIT 许可，见 `vendor/three.LICENSE`。
