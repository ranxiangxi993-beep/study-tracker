# 学科插画资源（已停用）

用户最终改选“英、数、政、专”中文字符标识。以下插画仅保留为历史设计素材，`SubjectIcon` 不再引用，当前界面不使用这些图片。

日期：2026-09-25。

用户选择：精致小插画，英语词典、数学尺规、政治书册、专业课书本，柔和配色。

制作方式：内置 `image_gen`，非 CLI。先生成英语词典，再以该图作为编辑参考，分别替换主体并保持同组质感。四枚 PNG 均保留透明通道，已复制到仓库，运行时无外部图片请求。Android Image 使用 `resizeMethod="resize"` 以目标显示尺寸进行缩采样。

首页 40 dp，计划与记录 32 dp，编辑弹窗 28 dp；不改动学科存储键、学习记录与目标院校功能。

## 文件与最终提示词

### 英语

文件：`assets/subjects/english.png`。

```text
Use case: stylized-concept. Asset type: one small illustrated subject icon for a real Chinese postgraduate study app, used at 36 to 44 CSS pixels, not an app logo or a full UI. Subject: ONE closed English dictionary, upright and slightly tilted in a restrained three-quarter view. A powder-blue cover with a darker muted blue spine, thick ivory-white page block, a tiny dusty-rose bookmark. Exact text on the cover: "Aa", large simple dark-blue sans-serif letterforms, no other text. Style: refined soft-color editorial mini-illustration, gently rounded solid shapes, subtle two-tone dimensional shading, clean crisp silhouette, matte paper finish, sparse generous details readable at tiny size. No black outlines, no outline-only icon, no shiny plastic, no childish face, no scenery. Composition: isolated centered object, square canvas, fills 86 percent of canvas height and 80 percent width, consistent visual weight, all edges fully visible. Background: genuinely transparent alpha, no colored tile, no circle, no pedestal, no cast shadow on background, no checkerboard baked into image, no border, no watermark. This is the first of a coordinated four-subject set, clean light mode palette.
```

### 数学

文件：`assets/subjects/math.png`。

```text
Use case: precise-object-edit. Edit this illustrated app icon into the MATH subject icon for the same coordinated set. Replace the dictionary entirely with TWO simple geometry tools: one upright muted golden-apricot triangular set square with a triangular cutout, and one powder-blue drawing compass opened into an A silhouette crossing in front. Keep the reference's refined soft-color matte-paper sculpted illustration style, restrained three-quarter angle, soft two-tone shading, crisp clean silhouette, softly rounded edges, and relative centered framing. The geometry tools should form one coherent balanced compact shape, similar optical weight to the reference book, readable at 36 to 44 pixels. No numbers or text, no tiny tick marks, no extra pencils, no equations, no visual clutter. Genuine transparent background with alpha, square canvas, tools occupy 86 percent canvas height and 80 percent width, not cropped. No colored tile, circle, pedestal, backdrop, drop shadow on background, black outline, metallic shine or watermark. This is a tiny in-app subject illustration, not an app logo.
```

### 政治

文件：`assets/subjects/politics.png`。

```text
Use case: precise-object-edit. Edit this illustrated app icon into the POLITICS subject icon for the same coordinated set. Replace the blue English dictionary with a compact dusty-rose hardcover study book, with a large simple ivory five-point star embossed on its front cover and a slim muted sage-green second book behind it, offset slightly upward and right. No letters, no title text, no flags, no national emblems, no decorative floating objects. Preserve the reference's refined soft-color matte-paper sculpted illustration style, restrained three-quarter angle, soft two-tone shading, crisp clean silhouette and softly rounded edges. The two books form one coherent compact shape, similar optical size to the reference book, instantly readable at 36 to 44 pixels. Dusty rose front cover, deep muted rose spine, ivory-white page edges, only a narrow sage accent from the rear book. Genuine transparent background with alpha, square canvas, centered complete object occupying 86 percent of canvas height and 80 percent width. No colored tile, circle, pedestal, backdrop, ground shadow, black outlines, shiny plastic, watermark or visual clutter. An editorial mini-illustration for a clean light-mode study app.
```

### 专业课

文件：`assets/subjects/professional.png`。

```text
Use case: precise-object-edit. Edit this illustrated app icon into the SPECIALIST STUDIES subject icon for the same coordinated set. Replace the closed dictionary entirely with ONE OPEN sage-teal hardcover textbook, shown from a gentle elevated three-quarter frontal view. Two broad ivory-white pages make a distinctive open-book silhouette, with a muted golden-apricot ribbon bookmark descending at the center gutter, a visible muted teal cover underneath. On the pages only two or three very broad understated grey-teal line impressions; no readable text, equations, seals, other symbols or extra objects. Preserve the reference's refined soft-color matte-paper sculpted mini-illustration style, soft two-tone shading, crisp clean silhouette, gently rounded solid forms and quiet study-app aesthetic. The open book should feel substantial and compact, not flat or spread too wide: same optical size and weight as the reference dictionary, readable at 36 to 44 pixels. Genuine transparent background with alpha, square canvas, centered complete object occupying 82 percent canvas width and 78 percent height, all edges visible. No colored tile, no circle, no pedestal, no backdrop, no ground shadow, no black outlines, no shiny plastic, no watermark.
```
