<?php
/**
 * GET /api/posts_list.php?car_id=123[&tipo=preventiva]
 * Lista os posts (modificações/manutenções) de um carro.
 * Requer login.
 */
require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/db.php';

require_method('GET');
require_login();

$carId = (int)($_GET['car_id'] ?? 0);
if ($carId <= 0) json_err('car_id inválido.', 400, 'ERR_CAR_ID');

$tipo = strtolower(trim((string)($_GET['tipo'] ?? '')));
$tiposValidos = ['preventiva','corretiva','estetica','upgrade','documentacao'];

$pdo = db();

// confirma existência do carro
$stmt = $pdo->prepare('SELECT id FROM carros WHERE id = ? AND deleted_at IS NULL LIMIT 1');
$stmt->execute([$carId]);
if (!$stmt->fetch()) json_err('Carro não encontrado.', 404, 'ERR_CAR_NOT_FOUND');

// monta query
$sql = 'SELECT p.id, p.carro_id, p.usuario_id, p.tipo, p.item,
               p.modificacao, p.responsavel, p.imagens,
               DATE_FORMAT(p.criado_em, "%d/%m/%Y") AS data_post,
               TIME_FORMAT(p.criado_em, "%H:%i")    AS hora_post,
               u.username, u.nome_display, u.foto_perfil
        FROM posts p
        JOIN usuarios u ON u.id = p.usuario_id
        WHERE p.carro_id = ?
          AND u.deleted_at IS NULL';
$params = [$carId];

if ($tipo !== '' && in_array($tipo, $tiposValidos, true)) {
    $sql .= ' AND p.tipo = ?';
    $params[] = $tipo;
}
$sql .= ' ORDER BY p.criado_em DESC';

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll();

// contadores por tipo (independente do filtro atual)
$cnt = $pdo->prepare(
   'SELECT p.tipo, COUNT(*) AS n
    FROM posts p
    JOIN usuarios u ON u.id = p.usuario_id
    WHERE p.carro_id = ?
      AND u.deleted_at IS NULL
    GROUP BY p.tipo'
);
$cnt->execute([$carId]);
$countsByType = [];
foreach ($tiposValidos as $t) $countsByType[$t] = 0;
foreach ($cnt->fetchAll() as $r) $countsByType[$r['tipo']] = (int)$r['n'];
$countsByType['all'] = array_sum($countsByType);

// normaliza linhas
foreach ($rows as &$r) {
    $r['id']         = (int)$r['id'];
    $r['carro_id']   = (int)$r['carro_id'];
    $r['usuario_id'] = (int)$r['usuario_id'];
    $r['imagens']    = !empty($r['imagens'])
        ? (json_decode($r['imagens'], true) ?: [])
        : [];
}

json_ok([
    'posts'   => $rows,
    'counts'  => $countsByType,
    'filter'  => $tipo ?: null,
]);
