"""
Porte em Python da logica do ArmorHelper.exe (ArmorSheetGen, por Mirsario).
Decompilado, entendido e reimplementado -- nao chama o binario original.

Diferenca chave em relacao ao original: aqui a densidade do template de
entrada (`input_scale`) e a densidade da folha de saida (`output_scale`)
sao parametros independentes -- o original sempre assume um template 1x
(128x80) e produz saida fixa em 2x (40x1120). Com input_scale=1 e
output_scale=2 (os valores do original) e o template real de 128x80, o
resultado e pixel-a-pixel identico ao .exe original -- confirmado contra
ArmorTemplate_v1_Head.json (0% de diferenca).

Estado: Head, Body, Female, Legs e Arms portados e validados (0% diff)
contra os JSONs de referencia. Full Armor / +Player / GIF ainda nao.
"""

from __future__ import annotations

from typing import Iterable, Optional, Sequence, Tuple

import numpy as np
from PIL import Image

# Tabela de offset por frame, extraida do decompilado (bodyHeadOffsets).
# Usada por Head, Body, Female e Arms pra alinhar cada um dos 20 frames.
BODY_HEAD_OFFSETS = [
    0, 0, 0, 0, 0, 0, 0, -1, -1, -1,
    0, 0, 0, 0, -1, -1, -1, 0, 0, 0,
]

FRONT_ARM_OFFSETS = [0, -1, -1, -1, -1, 0, 0, 0, 1, 2, 2, 1, 0, 0]
BACK_ARM_OFFSETS = [0, 1, 1, 1, 0, 0, 0, 0, -1, -2, -2, -1, 0, 0]

# legMapping do original: cada entrada [m] tem 1 ou 2 frames de destino.
LEG_MAPPING: Sequence[Sequence[int]] = [
    [5], [7], [8], [9], [10],
    [13], [14], [15], [16], [17, 18],
]

TEMPLATE_W_1X = 128
TEMPLATE_H_1X = 80

# Canvas base (por folha), em unidades 1x -- igual ao Color[20, 560] do original.
SHEET_W_1X = 20
SHEET_H_1X = 560

TRANSPARENT = (0, 0, 0, 0)

Point = Tuple[int, int]


def load_template_rgba(path: str) -> np.ndarray:
    """Carrega o template como array numpy (H, W, 4) uint8, RGBA."""
    img = Image.open(path).convert("RGBA")
    return np.array(img)


def copy_rect(
    source: np.ndarray,
    dest: np.ndarray,
    rect_x: int,
    rect_y: int,
    rect_w: int,
    rect_h: int,
    dest_x: int,
    dest_y: int,
    scale: int,
    ignored_points: Optional[Iterable[Point]] = None,
) -> None:
    """
    Equivalente ao Copy() do original, mas com todas as coordenadas
    (origem e destino) multiplicadas por `scale`.

    source/dest sao arrays (H, W, 4) uint8 RGBA -- note a ordem (linha, coluna),
    diferente do Color[x, y] do C# original.

    `ignored_points`, quando passado, e uma lista de coordenadas (x, y) em
    unidades 1x (nativas do template original), igual ao Point[] ignoredPoints
    do C# -- pixels de origem nessas coordenadas sao pulados na copia.
    """
    sx0, sy0 = rect_x * scale, rect_y * scale
    sw, sh = rect_w * scale, rect_h * scale
    dx0, dy0 = dest_x * scale, dest_y * scale

    src_h, src_w = source.shape[:2]
    dst_h, dst_w = dest.shape[:2]

    ignored = set(ignored_points) if ignored_points else None

    for i in range(sh):
        sy = sy0 + i
        dy = dy0 + i
        if sy < 0 or sy >= src_h or dy < 0 or dy >= dst_h:
            continue
        for j in range(sw):
            sx = sx0 + j
            dx = dx0 + j
            if sx < 0 or sx >= src_w or dx < 0 or dx >= dst_w:
                continue
            if ignored and (sx // scale, sy // scale) in ignored:
                continue
            pixel = source[sy, sx]
            if pixel[3] > 1:  # alpha > 1, igual ao original (A > 1)
                dest[dy, dx] = pixel


def fill_rect(
    dest: np.ndarray,
    x: int,
    y: int,
    w: int,
    h: int,
    color: Tuple[int, int, int, int],
    scale: int,
) -> None:
    """Equivalente ao Fill() do original -- preenche um retangulo do destino."""
    dx0, dy0 = x * scale, y * scale
    dw, dh = w * scale, h * scale
    dst_h, dst_w = dest.shape[:2]

    y0, y1 = max(dy0, 0), min(dy0 + dh, dst_h)
    x0, x1 = max(dx0, 0), min(dx0 + dw, dst_w)
    if y1 <= y0 or x1 <= x0:
        return
    dest[y0:y1, x0:x1] = color


def content_bbox(template: np.ndarray) -> Tuple[int, int, int, int]:
    """
    Bbox (x0, y0, x1, y1) dos pixels com alpha > 0 -- exclusiva no fim
    (x1/y1 nao fazem parte do conteudo, prontos pra slice). Canvas
    totalmente transparente devolve o canvas inteiro.
    """
    alpha = template[:, :, 3]
    ys, xs = np.nonzero(alpha > 0)
    if len(xs) == 0:
        return 0, 0, template.shape[1], template.shape[0]
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def prepare_template(template: np.ndarray, input_scale: int, output_scale: int) -> np.ndarray:
    """
    Recorta o template pra bbox do conteudo opaco e reamostra (nearest-
    neighbor) pra que sua densidade de pixels fique alinhada com
    output_scale, independente da densidade em que foi fornecido
    (input_scale).

    O recorte pela bbox e obrigatorio, nao cosmetico: canvas com padding
    (ex. gerado por ferramenta de IA que sempre devolve quadrado) faz a
    largura/altura do canvas nao bater com o conteudo real -- bug real
    medido com armor_template_v1_ref.png (canvas 512x512, conteudo real
    512x320, 96px de padding vertical). Sem o recorte, o resize usava as
    dimensoes erradas (512x512 * 0.5 = 256x256 em vez de 512x320 * 0.5 =
    256x160) e todo copy_rect() subsequente lia da posicao errada --
    resultado saia com a silhueta deslocada, nao só "com mais detalhe".

    Levanta erro se o conteudo recortado nao bater exatamente com
    TEMPLATE_W_1X/H_1X * input_scale -- input_scale errado (ou um canvas
    com padding em formato nao suportado) tem que falhar alto, nao gerar
    sheet silenciosamente desalinhado. Use detect_input_scale() pra achar
    o input_scale certo antes de chamar isto.
    """
    x0, y0, x1, y1 = content_bbox(template)
    content = template[y0:y1, x0:x1]

    expected_w = TEMPLATE_W_1X * input_scale
    expected_h = TEMPLATE_H_1X * input_scale
    if content.shape[1] != expected_w or content.shape[0] != expected_h:
        raise ValueError(
            f"conteudo do template (bbox opaca) e {content.shape[1]}x{content.shape[0]}, "
            f"mas input_scale={input_scale} esperava {expected_w}x{expected_h} "
            f"({TEMPLATE_W_1X}x{TEMPLATE_H_1X} * {input_scale}). Confira o input_scale "
            f"(GET /api/armor/detect-scale) ou o padding do canvas."
        )

    if input_scale == output_scale:
        return content
    img = Image.fromarray(content, mode="RGBA")
    factor = output_scale / input_scale
    new_w = round(img.width * factor)
    new_h = round(img.height * factor)
    return np.array(img.resize((new_w, new_h), Image.NEAREST))


def _new_sheet(scale: int) -> np.ndarray:
    return np.zeros((SHEET_H_1X * scale, SHEET_W_1X * scale, 4), dtype=np.uint8)


def front_arm(template: np.ndarray, dest: np.ndarray, scale: int) -> None:
    """Porte do delegate `frontArm` do original."""
    copy_rect(template, dest, 1, 1, 12, 16, 0, 9, scale)
    copy_rect(template, dest, 14, 1, 12, 16, 0, 33, scale)
    copy_rect(template, dest, 27, 1, 16, 16, 2, 61, scale)
    copy_rect(template, dest, 44, 1, 17, 16, 2, 92, scale)
    copy_rect(template, dest, 62, 1, 16, 16, 2, 121, scale)
    copy_rect(
        template, dest, 14, 1, 12, 16, 0, 145, scale,
        ignored_points=[(22, 9), (22, 10), (22, 11), (22, 12)],
    )
    for num9 in range(14):
        num10 = num9 + 6
        dest_x = FRONT_ARM_OFFSETS[num9]
        dest_y = num10 * 28 + 12 + BODY_HEAD_OFFSETS[num10]
        copy_rect(template, dest, 79, 1, 13, 11, dest_x, dest_y, scale)


def back_arm(template: np.ndarray, dest: np.ndarray, scale: int) -> None:
    """Porte do delegate `backArm` do original."""
    layer = _new_sheet(scale)

    copy_rect(template, layer, 94, 1, 12, 11, 7, 14, scale)
    copy_rect(template, layer, 94, 1, 12, 11, 8, 40, scale)
    copy_rect(template, layer, 94, 1, 12, 11, 7, 70, scale)

    for num6 in range(14):
        num7 = num6 + 6
        dest_x = 8 + BACK_ARM_OFFSETS[num6]
        dest_y = num7 * 28 + 12 + BODY_HEAD_OFFSETS[num7]
        copy_rect(template, layer, 94, 1, 12, 11, dest_x, dest_y, scale)
        if BACK_ARM_OFFSETS[num6] == -2:
            copy_rect(template, layer, 101, 8, 1, 1, 14, num7 * 28 + 18, scale)

    for num8 in range(20):
        fill_rect(layer, 8, 21 + 28 * num8, 6, 1, TRANSPARENT, scale)
    fill_rect(layer, 0, 0, 13, 560, TRANSPARENT, scale)

    copy_rect(layer, dest, 0, 0, SHEET_W_1X, SHEET_H_1X, 0, 0, scale)


def draw_head(template: np.ndarray, dest: np.ndarray, scale: int) -> None:
    """
    Porte da acao "Head" do original:

        for (int num5 = 0; num5 < 20; num5++) {
            Copy(source, dest, new Rectangle(1, 19, 20, 28),
                 new Point(0, num5 * 28 + bodyHeadOffsets[num5]));
        }
    """
    for frame in range(20):
        dest_y = frame * 28 + BODY_HEAD_OFFSETS[frame]
        copy_rect(
            template, dest,
            rect_x=1, rect_y=19, rect_w=20, rect_h=28,
            dest_x=0, dest_y=dest_y,
            scale=scale,
        )


def draw_body(template: np.ndarray, dest: np.ndarray, scale: int) -> None:
    """Porte da acao "Body" do original (backArm + torso + frontArm)."""
    back_arm(template, dest, scale)

    for num3 in range(20):
        num4 = 48 if num3 == 5 else 19
        dest_y = num3 * 28 + BODY_HEAD_OFFSETS[num3]
        ignored = None if (num3 != 1 and num3 <= 5) else [(37, num4 + 16), (37, num4 + 17)]
        copy_rect(
            template, dest, 23, num4, 20, 28, 0, dest_y, scale,
            ignored_points=ignored,
        )

    front_arm(template, dest, scale)


def draw_female(template: np.ndarray, dest: np.ndarray, scale: int) -> None:
    """Porte da acao "Body (Female)" do original."""
    back_arm(template, dest, scale)

    for num2 in range(20):
        rect_y = 48 if num2 == 5 else 19
        dest_y = num2 * 28 + BODY_HEAD_OFFSETS[num2]
        copy_rect(template, dest, 44, rect_y, 20, 28, 0, dest_y, scale)

    front_arm(template, dest, scale)


def draw_legs(template: np.ndarray, dest: np.ndarray, scale: int) -> None:
    """Porte da acao "Legs" do original."""
    for k in range(7):
        num = (k if k < 5 else (11 if k == 5 else 19)) * 28
        for l in range(2):
            flag = l == (1 if k != 6 else 0)
            rect_x = 100 if l == 1 else 110
            dest_x = 5 if flag else 7
            dest_y = 19 + num
            ignored = [
                (101 if l == 1 else 111, 21),
                (107 if l == 1 else 117, 21),
            ]
            copy_rect(
                template, dest, rect_x, 19, 9, 9, dest_x, dest_y, scale,
                ignored_points=ignored,
            )

    copy_rect(template, dest, 100, 19, 9, 9, 6, 187, scale)
    copy_rect(template, dest, 100, 19, 9, 9, 6, 355, scale)

    for m, targets in enumerate(LEG_MAPPING):
        rect_x = 83 if m >= 5 else 66
        rect_y = 19 + (m % 5) * 10
        for n in targets:
            copy_rect(template, dest, rect_x, rect_y, 16, 9, 3, 19 + n * 28, scale)


def draw_arms(template: np.ndarray, dest: np.ndarray, scale: int) -> None:
    """Porte da acao "Arms" do original (== frontArm sozinho)."""
    front_arm(template, dest, scale)


def draw_full_armor(template: np.ndarray, dest: np.ndarray, scale: int) -> None:
    """
    Porte da acao "Full Armor" do original:

        actions["Legs"].action(source, dest, file);
        actions["Body"].action(source, dest, file);
        actions["Head"].action(source, dest, file);
        frontArm(source, dest, file);

    Ordem importa -- cada Copy() so sobrescreve onde ha pixel opaco na
    origem, entao camadas desenhadas depois cobrem as anteriores nas
    areas onde se sobrepoem.
    """
    draw_legs(template, dest, scale)
    draw_body(template, dest, scale)
    draw_head(template, dest, scale)
    front_arm(template, dest, scale)


def draw_full_armor_female(template: np.ndarray, dest: np.ndarray, scale: int) -> None:
    """Porte da acao "Full Armor (Female)" do original."""
    draw_legs(template, dest, scale)
    draw_female(template, dest, scale)
    draw_head(template, dest, scale)
    front_arm(template, dest, scale)


def _make_generator(draw_fn):
    def generate(template: np.ndarray, output_scale: int, input_scale: int = 1) -> np.ndarray:
        template = prepare_template(template, input_scale, output_scale)
        dest = _new_sheet(output_scale)
        draw_fn(template, dest, output_scale)
        return dest
    return generate


generate_head_sheet = _make_generator(draw_head)
generate_body_sheet = _make_generator(draw_body)
generate_female_sheet = _make_generator(draw_female)
generate_legs_sheet = _make_generator(draw_legs)
generate_arms_sheet = _make_generator(draw_arms)
generate_full_armor_sheet = _make_generator(draw_full_armor)
generate_full_armor_female_sheet = _make_generator(draw_full_armor_female)


def save_png(pixels: np.ndarray, path: str) -> None:
    Image.fromarray(pixels, mode="RGBA").save(path)


# Ordem exata dos 52 frames do GIF, portada de SaveAsGif() do original.
def gif_frame_indices() -> list[int]:
    order = []
    for i in range(5):
        flag = i in (2, 4)
        flag2 = i == 3
        j_start = 1 if flag2 else (6 if not flag else 0)
        j_end = 5 if flag2 else (10 if flag else 20)
        for j in range(j_start, j_end):
            order.append(j if not flag else 0)
    return order


def extract_gif_frames(sheet: np.ndarray, scale: int) -> list[np.ndarray]:
    """
    Fatia o canvas completo (ja em output_scale) nos 52 frames de 20x28
    (em unidades 1x) usados pelo GIF, na ordem exata do original -- ver
    gif_frame_indices(). Cada frame sai com shape (28*scale, 20*scale, 4).
    """
    frame_h = 28 * scale
    frames = []
    for num in gif_frame_indices():
        y0 = num * frame_h
        frames.append(sheet[y0:y0 + frame_h, :, :].copy())
    return frames


def save_gif(frames: list[np.ndarray], path: str, duration_ms: int = 66) -> None:
    """
    Monta um GIF animado (loop infinito) a partir dos frames RGBA, com
    paleta indexada + 1 indice reservado pra transparencia -- equivalente
    ao AnimatedGifCreator(file, 66, 0) do original (66ms/frame, loop=0).
    """
    colors: set[Tuple[int, int, int]] = set()
    for f in frames:
        opaque = f[f[:, :, 3] > 0][:, :3]
        colors.update(tuple(int(c) for c in px) for px in opaque)
    colors_sorted = sorted(colors)
    if len(colors_sorted) > 255:
        raise ValueError(f"Paleta com {len(colors_sorted)} cores excede o limite de 255 pro GIF indexado")

    color_to_idx = {c: i + 1 for i, c in enumerate(colors_sorted)}
    palette = [0, 0, 0]
    for c in colors_sorted:
        palette.extend(c)
    palette.extend([0, 0, 0] * (256 - len(colors_sorted) - 1))

    pil_frames = []
    for f in frames:
        h, w = f.shape[:2]
        idx_arr = np.zeros((h, w), dtype=np.uint8)
        opaque_mask = f[:, :, 3] > 0
        for c, idx in color_to_idx.items():
            match = opaque_mask & (f[:, :, 0] == c[0]) & (f[:, :, 1] == c[1]) & (f[:, :, 2] == c[2])
            idx_arr[match] = idx
        img = Image.fromarray(idx_arr, mode="P")
        img.putpalette(palette)
        pil_frames.append(img)

    pil_frames[0].save(
        path,
        save_all=True,
        append_images=pil_frames[1:],
        duration=duration_ms,
        loop=0,
        disposal=2,
        transparency=0,
    )


# Porte do "Terraria Sprite Transformer v1.jar" (autor nao identificado no
# decompilado, nome bate com o arquivo). Todo esse jar e 32 recortes fixos
# (sx, sy, sw, sh) -> (dx, dy) -- sempre 1:1, sem resize -- que juntam 3
# folhas de entrada (Body/Arm/Female, cada uma 40x1120, ou seja, exatamente
# a saida de generate_body_sheet/generate_arms_sheet/generate_female_sheet
# com output_scale=2) num unico sheet 360x224 no layout que o tModLoader
# espera pra preview de equipamento completo.
TERRARIA_SHEET_W = 360
TERRARIA_SHEET_H = 224
TERRARIA_INPUT_W = 40
TERRARIA_INPUT_H = 1120

# Todas as constantes acima e a tabela de recortes abaixo foram extraidas
# do decompilado com output_scale=2 fixo (unico valor que o .jar original
# suporta). Toda entrada da tabela e um numero par -- ou seja, e uma folha
# em 1x multiplicada por 2 -- entao da pra derivar a base em 1x dividindo
# por 2 (exato, sem arredondamento) e depois escalar pra qualquer
# output_scale multiplicando de novo. E o que TERRARIA_SHEET_DRAWS_1X /
# _terraria_draws_at() / compose_terraria_sheet(..., output_scale=N) fazem.
TERRARIA_SHEET_DRAWS: list[tuple[str, int, int, int, int, int, int]] = [
    ("body", 12, 14, 22, 20, 12, 14),
    ("body", 12, 90, 16, 16, 12, 34),
    ("body", 12, 306, 20, 16, 52, 26),
    ("body", 32, 416, 6, 18, 108, 142),
    ("body", 30, 416, 8, 18, 148, 138),
    ("body", 32, 416, 6, 18, 188, 142),
    ("body", 30, 416, 8, 18, 148, 194),
    ("body", 28, 416, 10, 18, 188, 194),
    ("body", 32, 416, 6, 18, 228, 194),
    ("body", 34, 416, 4, 18, 268, 196),
    ("body", 24, 294, 12, 16, 104, 182),
    ("arm", 0, 0, 40, 56, 80, 0),
    ("arm", 0, 56, 40, 56, 120, 0),
    ("arm", 0, 112, 40, 56, 160, 0),
    ("arm", 0, 168, 40, 56, 200, 0),
    ("arm", 0, 224, 40, 56, 240, 0),
    ("arm", 4, 16, 18, 32, 284, 16),
    ("arm", 4, 16, 18, 32, 284, 70),
    ("arm", 4, 16, 18, 32, 284, 124),
    ("arm", 4, 16, 18, 32, 284, 178),
    ("arm", 4, 30, 18, 18, 338, 30),
    ("arm", 4, 30, 18, 18, 338, 84),
    ("arm", 4, 30, 18, 18, 338, 138),
    ("arm", 4, 30, 18, 18, 338, 192),
    ("arm", 4, 862, 26, 26, 244, 80),
    ("arm", 0, 280, 40, 56, 80, 56),
    ("arm", 0, 336, 40, 56, 120, 56),
    ("arm", 0, 560, 40, 56, 160, 56),
    ("arm", 0, 952, 40, 56, 200, 56),
    ("female", 12, 14, 22, 22, 12, 126),
    ("female", 12, 92, 16, 16, 12, 148),
    ("female", 12, 306, 20, 16, 52, 138),
    # g2dOutput.scale(2.0, 100.0) do original e codigo morto (chamado apos
    # todos os draws, sem efeito) -- nao precisa de equivalente aqui.
]


# Base em 1x, derivada uma unica vez da tabela validada em 2x (divisao
# exata -- ver comentario acima). _terraria_draws_at() escala essa base
# pro output_scale pedido.
TERRARIA_SHEET_DRAWS_1X: list[tuple[str, int, int, int, int, int, int]] = [
    (name, sx // 2, sy // 2, sw // 2, sh // 2, dx // 2, dy // 2)
    for name, sx, sy, sw, sh, dx, dy in TERRARIA_SHEET_DRAWS
]


def _terraria_draws_at(output_scale: int) -> list[tuple[str, int, int, int, int, int, int]]:
    return [
        (name, sx * output_scale, sy * output_scale, sw * output_scale,
         sh * output_scale, dx * output_scale, dy * output_scale)
        for name, sx, sy, sw, sh, dx, dy in TERRARIA_SHEET_DRAWS_1X
    ]


def compose_terraria_sheet(
    body: np.ndarray, arm: np.ndarray, female: np.ndarray, output_scale: int = 2
) -> np.ndarray:
    """
    Porte do TerrariaSpriteTransform.jar: junta Body/Arm/Female num sheet
    final unico, no layout que o tModLoader espera pra preview de
    equipamento completo. O .jar original so suportava output_scale=2
    (360x224); aqui a tabela de recortes e re-derivada pra qualquer escala
    a partir da base em 1x (ver TERRARIA_SHEET_DRAWS_1X) -- output_scale=2
    reproduz o original pixel-a-pixel (validado contra
    terraria_sheet_fixed_v1.png, gerado pelo original antes desta
    generalizacao).
    """
    input_w = (TERRARIA_INPUT_W // 2) * output_scale
    input_h = (TERRARIA_INPUT_H // 2) * output_scale
    sheet_w = (TERRARIA_SHEET_W // 2) * output_scale
    sheet_h = (TERRARIA_SHEET_H // 2) * output_scale

    sources = {"body": body, "arm": arm, "female": female}
    for name, img in sources.items():
        h, w = img.shape[:2]
        if w != input_w or h != input_h:
            raise ValueError(
                f"input '{name}' precisa ser {input_w}x{input_h} pra "
                f"output_scale={output_scale} (recebido {w}x{h})"
            )

    dest = np.zeros((sheet_h, sheet_w, 4), dtype=np.uint8)
    for name, sx, sy, sw, sh, dx, dy in _terraria_draws_at(output_scale):
        sub = sources[name][sy:sy + sh, sx:sx + sw]
        mask = sub[:, :, 3] > 0
        region = dest[dy:dy + sh, dx:dx + sw]
        region[mask] = sub[mask]
    return dest


def generate_terraria_sheet(template: np.ndarray, output_scale: int, input_scale: int = 1) -> np.ndarray:
    """
    Gera Body/Arm/Female a partir do mesmo template e ja compoe no sheet
    final do tModLoader -- o fluxo completo que corresponde ao
    TerrariaSpriteTransform.jar, num passo so.
    """
    body = generate_body_sheet(template, output_scale, input_scale)
    arm = generate_arms_sheet(template, output_scale, input_scale)
    female = generate_female_sheet(template, output_scale, input_scale)
    return compose_terraria_sheet(body, arm, female, output_scale)


def detect_input_scale(
    template: np.ndarray,
    base_w: int = TEMPLATE_W_1X,
    base_h: int = TEMPLATE_H_1X,
    max_scale: int = 4,
) -> dict:
    """
    Mede a bbox de conteudo opaco (alpha > 0) do template -- nao o canvas
    inteiro, que pode ter padding (caso real: armor_template_v1_ref.png e
    um canvas 512x512 com o conteudo real ocupando so 512x320) -- e
    confere se ela bate exatamente com base_w/base_h multiplicados por
    1..max_scale, nos dois eixos (so o lado maior nao e suficiente: arte
    distorcida podia bater no lado maior e errar no menor).

    Retorna um dict com a bbox medida e o scale detectado (None se nao
    bater com nenhum). O chamador decide o que fazer com None -- a UI
    deixa o campo pro usuario escolher manualmente de qualquer jeito.

    Usa o mesmo content_bbox() que prepare_template() usa pra recortar de
    verdade -- o valor aqui devolvido e o que efetivamente vai ser
    validado contra input_scale quando o sheet for gerado.
    """
    if not np.any(template[:, :, 3] > 0):
        return {
            "canvas_w": int(template.shape[1]),
            "canvas_h": int(template.shape[0]),
            "content_w": 0,
            "content_h": 0,
            "detected_scale": None,
            "matches": {},
        }

    x0, y0, x1, y1 = content_bbox(template)
    content_w = x1 - x0
    content_h = y1 - y0

    matches = {}
    detected = None
    for scale in range(1, max_scale + 1):
        hit = content_w == base_w * scale and content_h == base_h * scale
        matches[scale] = hit
        if hit:
            detected = scale

    return {
        "canvas_w": int(template.shape[1]),
        "canvas_h": int(template.shape[0]),
        "content_w": content_w,
        "content_h": content_h,
        "detected_scale": detected,
        "matches": matches,
    }


ACTIONS = {
    "Head": generate_head_sheet,
    "Body": generate_body_sheet,
    "Female": generate_female_sheet,
    "Legs": generate_legs_sheet,
    "Arms": generate_arms_sheet,
    "FullArmor": generate_full_armor_sheet,
    "FullArmorFemale": generate_full_armor_female_sheet,
    "TerrariaSheet": generate_terraria_sheet,
}


if __name__ == "__main__":
    import sys

    template_path = sys.argv[1] if len(sys.argv) > 1 else (
        "/root/pixelforge/dev-uploads/_extracted_armorhelper/ArmorTemplate_v1.png"
    )
    action = sys.argv[2] if len(sys.argv) > 2 else "Head"
    output_scale = int(sys.argv[3]) if len(sys.argv) > 3 else 2
    input_scale = int(sys.argv[4]) if len(sys.argv) > 4 else 1

    template = load_template_rgba(template_path)
    print(f"template carregado: {template.shape[1]}x{template.shape[0]} (input_scale={input_scale})")

    sheet = ACTIONS[action](template, output_scale, input_scale)
    print(f"{action} sheet gerada: {sheet.shape[1]}x{sheet.shape[0]} (output_scale={output_scale})")

    out_path = f"/root/pixelforge/dev-uploads/{action.lower()}_test_output.png"
    save_png(sheet, out_path)
    print(f"salvo em: {out_path}")

    if len(sys.argv) > 5 and sys.argv[5] == "gif":
        frames = extract_gif_frames(sheet, output_scale)
        gif_path = f"/root/pixelforge/dev-uploads/{action.lower()}_test_output.gif"
        save_gif(frames, gif_path)
        print(f"gif salvo em: {gif_path} ({len(frames)} frames)")
