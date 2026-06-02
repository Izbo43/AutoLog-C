<?php
/**
 * GET /api/cars_list.php?handle=MarioBros
 * Retorna os carros do usuário cujo handle foi informado.
 * Se o handle for o do próprio usuário logado, inclui dados privados (placa, renavam, chassi).
 * Requer login.
 */
require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/db.php';

require_method('GET');
$meId = require_login();

$handle = trim((string)($_GET['handle'] ?? ''));
$handle = ltrim($handle, '@');

$pdo = db();

if ($handle === '') {
    // sem handle → meus carros
    $userId = $meId;
} else {
    $stmt = $pdo->prepare('SELECT id FROM usuarios WHERE LOWER(username) = LOWER(?) AND deleted_at IS NULL LIMIT 1');
    $stmt->execute([$handle]);
    $row = $stmt->fetch();
    if (!$row) json_err('Usuário não encontrado.', 404, 'ERR_USER_NOT_FOUND');
    $userId = (int)$row['id'];
}

$isOwner = $userId === $meId;

// campos públicos
$cols = 'id, usuario_id, modelo, descricao, fabricante, ano,
         cidade, estado, combustivel, quilometragem, cambio, cor, motor,
         foto_capa, fotos_extra,
         DATE_FORMAT(criado_em, "%d/%m/%Y") AS data_cadastro';

if ($isOwner) {
    // dono vê também os dados privados
    $cols .= ', placa, renavam, chassi, documentacao';
}

$stmt = $pdo->prepare("SELECT {$cols} FROM carros WHERE usuario_id = ? AND deleted_at IS NULL ORDER BY criado_em DESC");
$stmt->execute([$userId]);
$cars = $stmt->fetchAll();

foreach ($cars as &$c) {
    $c['id']            = (int)$c['id'];
    $c['usuario_id']    = (int)$c['usuario_id'];
    $c['ano']           = $c['ano'] === null ? null : (int)$c['ano'];
    $c['quilometragem'] = $c['quilometragem'] === null ? null : (int)$c['quilometragem'];
    if (!empty($c['fotos_extra'])) {
        $decoded = json_decode($c['fotos_extra'], true);
        $c['fotos_extra'] = is_array($decoded) ? $decoded : [];
    } else {
        $c['fotos_extra'] = [];
    }
}

json_ok(['cars' => $cars, 'is_owner' => $isOwner]);
