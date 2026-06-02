<?php
/**
 * GET /api/users_search.php?q=mario
 * Retorna até 6 usuários cujo username ou nome de exibição contém o termo.
 * Requer login (privacidade básica — só usuários cadastrados podem buscar).
 */
require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/db.php';

require_method('GET');
require_login();

$q = trim((string)($_GET['q'] ?? ''));
$q = ltrim($q, '@');

if ($q === '') { json_ok(['users' => []]); }

$like = '%' . $q . '%';
$stmt = db()->prepare(
   'SELECT u.id, u.username, u.nome_display, u.foto_perfil,
           (SELECT COUNT(*) FROM carros c
            WHERE c.usuario_id = u.id AND c.deleted_at IS NULL) AS car_count
    FROM usuarios u
    WHERE (u.username LIKE ? OR u.nome_display LIKE ?)
      AND u.deleted_at IS NULL
    ORDER BY (u.username = ?) DESC, u.username ASC
    LIMIT 6'
);
$stmt->execute([$like, $like, $q]);
$rows = $stmt->fetchAll();

foreach ($rows as &$r) {
    $r['id']        = (int)$r['id'];
    $r['car_count'] = (int)$r['car_count'];
}

json_ok(['users' => $rows]);
