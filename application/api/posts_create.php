<?php
/**
 * POST /api/posts_create.php
 * Cria um post de modificação/manutenção em um carro.
 * Só o dono do carro pode postar.
 *
 * Body JSON: {
 *   car_id: int,
 *   tipo: preventiva|corretiva|estetica|upgrade|documentacao,
 *   item: string,
 *   modificacao: string,
 *   responsavel: string,
 *   imagens: string[]   // até 4 dataURLs (base64)
 * }
 */
require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/db.php';

require_method('POST');
$meId = require_login();

$in = read_json_body();

$carId       = (int)($in['car_id']      ?? 0);
$tipo        = strtolower(s($in['tipo'] ?? '', 30));
$item        = s($in['item']            ?? '', 200);
$modificacao = s($in['modificacao']     ?? '', 4000);
$responsavel = s($in['responsavel']     ?? '', 150);
$imagens     = $in['imagens'] ?? [];

// ── VALIDAÇÕES ─────────────────────────────────────────────────
if ($carId <= 0)         json_err('car_id inválido.', 400, 'ERR_CAR_ID');
if ($item === '')        json_err('Informe o item/componente.', 400, 'ERR_ITEM');
if ($modificacao === '') json_err('Descreva a modificação realizada.', 400, 'ERR_MOD');
if ($responsavel === '') json_err('Informe o responsável.', 400, 'ERR_RESP');

$tiposValidos = ['preventiva','corretiva','estetica','upgrade','documentacao'];
if (!in_array($tipo, $tiposValidos, true)) {
    json_err('Tipo de modificação inválido.', 400, 'ERR_TIPO');
}

if (!is_array($imagens))            $imagens = [];
if (count($imagens) > 4)            $imagens = array_slice($imagens, 0, 4);

// ── AUTORIZAÇÃO: só o dono do carro pode postar ────────────────
$pdo  = db();
$stmt = $pdo->prepare('SELECT usuario_id FROM carros WHERE id = ? AND deleted_at IS NULL LIMIT 1');
$stmt->execute([$carId]);
$car  = $stmt->fetch();

if (!$car) json_err('Carro não encontrado.', 404, 'ERR_CAR_NOT_FOUND');
if ((int)$car['usuario_id'] !== $meId) {
    json_err('Você só pode postar em carros que são seus.', 403, 'ERR_NOT_OWNER');
}

// ── INSERT ─────────────────────────────────────────────────────
$sql = 'INSERT INTO posts (carro_id, usuario_id, tipo, item, modificacao, responsavel, imagens)
        VALUES (:carro_id, :usuario_id, :tipo, :item, :modificacao, :responsavel, :imagens)';

$stmt = $pdo->prepare($sql);
$stmt->execute([
    ':carro_id'    => $carId,
    ':usuario_id'  => $meId,
    ':tipo'        => $tipo,
    ':item'        => $item,
    ':modificacao' => $modificacao,
    ':responsavel' => $responsavel,
    ':imagens'     => $imagens ? json_encode($imagens, JSON_UNESCAPED_UNICODE) : null,
]);

json_ok(['id' => (int)$pdo->lastInsertId()], 201);
