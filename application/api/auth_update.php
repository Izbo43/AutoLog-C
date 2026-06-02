<?php
/**
 * POST /api/auth_update.php
 * Atualiza dados do próprio usuário logado.
 *
 * REGRAS:
 *   - Apenas o próprio usuário pode editar seus dados (require_login).
 *   - Todos os campos são OPCIONAIS — só atualizamos o que veio no JSON.
 *   - Campos BLOQUEADOS (ignorados silenciosamente mesmo se enviados):
 *     cpf_cnpj, data_nasc, username, id, criado_em, deleted_at, senha_hash.
 *   - Validação SÓ se o campo foi enviado.
 *   - Troca de senha exige (senha_atual, senha_nova, senha_nova_confirma).
 *   - Mudança de email valida unicidade entre contas ATIVAS.
 */
require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/db.php';

require_method('POST');
$meId = require_login();

$in  = read_json_body();
$pdo = db();

$stmt = $pdo->prepare('SELECT * FROM usuarios WHERE id = ? AND deleted_at IS NULL LIMIT 1');
$stmt->execute([$meId]);
$me = $stmt->fetch();
if (!$me) json_err('Sessão inválida.', 401, 'ERR_INVALID_SESSION');


/** Campo presente E com conteúdo não-vazio? */
$sent = function (string $key) use ($in): bool {
    return array_key_exists($key, $in) && $in[$key] !== null && trim((string)$in[$key]) !== '';
};

/** Campo presente, mesmo que vazio? (para permitir LIMPAR campos opcionais) */
$keyPresent = function (string $key) use ($in): bool {
    return array_key_exists($key, $in);
};


$set    = [];  // ex: ["email = :email"]
$params = [];  // ex: [":email" => "novo@ex.com"]


// === NOME DE EXIBIÇÃO ============================================
if ($sent('nome_display')) {
    $v = s($in['nome_display'], 100);
    if (strlen($v) < 2) json_err('Nome de exibição muito curto.', 400, 'ERR_DISPLAY_NAME');
    $set[]                   = 'nome_display = :nome_display';
    $params[':nome_display'] = $v;
}

// === NOME COMPLETO ================================================
if ($sent('nome_completo')) {
    $v = s($in['nome_completo'], 150);
    if (strlen($v) < 3) json_err('Nome completo muito curto.', 400, 'ERR_FULL_NAME');
    $set[]                    = 'nome_completo = :nome_completo';
    $params[':nome_completo'] = $v;
}

// === EMAIL ========================================================
if ($sent('email')) {
    $v = strtolower(s($in['email'], 150));
    if (!filter_var($v, FILTER_VALIDATE_EMAIL)) {
        json_err('Email inválido.', 400, 'ERR_EMAIL');
    }
    if ($v !== strtolower((string)$me['email'])) {
        $chk = $pdo->prepare('SELECT id FROM usuarios
                              WHERE LOWER(email) = LOWER(?)
                                AND id <> ?
                                AND deleted_at IS NULL
                              LIMIT 1');
        $chk->execute([$v, $meId]);
        if ($chk->fetch()) json_err('Este email já está em uso por outra conta.', 409, 'ERR_EMAIL_TAKEN');
    }
    $set[]            = 'email = :email';
    $params[':email'] = $v;
}

// === TELEFONE (10 ou 11 dígitos com DDD) ==========================
if ($sent('telefone')) {
    $v = digits_only($in['telefone']);
    if (strlen($v) < 10 || strlen($v) > 11) {
        json_err('Telefone inválido (use DDD + 8 ou 9 dígitos).', 400, 'ERR_PHONE');
    }
    $set[]               = 'telefone = :telefone';
    $params[':telefone'] = $v;
}

// === TELEFONE SECUNDÁRIO ==========================================
if ($keyPresent('telefone2')) {
    $v = digits_only($in['telefone2'] ?? '');
    if ($v !== '' && (strlen($v) < 10 || strlen($v) > 11)) {
        json_err('Telefone secundário inválido.', 400, 'ERR_PHONE2');
    }
    $set[]                = 'telefone2 = :telefone2';
    $params[':telefone2'] = $v !== '' ? $v : null;
}

// === SOBRE ========================================================
if ($keyPresent('sobre')) {
    $set[]            = 'sobre = :sobre';
    $params[':sobre'] = s($in['sobre'] ?? '', 500);
}

// === FOTOS ========================================================
if ($keyPresent('foto_perfil')) {
    $v = (string)($in['foto_perfil'] ?? '');
    if ($v === '') {
        $v = $me['foto_perfil']
            ?: 'https://api.dicebear.com/7.x/bottts/svg?seed=' . urlencode((string)$me['username']) . '&backgroundColor=1a1a1f';
    }
    $set[]                  = 'foto_perfil = :foto_perfil';
    $params[':foto_perfil'] = $v;
}

if ($keyPresent('foto_banner')) {
    $v = (string)($in['foto_banner'] ?? '');
    $set[]                  = 'foto_banner = :foto_banner';
    $params[':foto_banner'] = $v !== '' ? $v : null;
}

// === ENDEREÇO =====================================================
if ($sent('cep')) {
    $v = digits_only($in['cep']);
    if (strlen($v) !== 8) json_err('CEP inválido (8 dígitos).', 400, 'ERR_CEP');
    $set[]          = 'cep = :cep';
    $params[':cep'] = $v;
}
if ($keyPresent('rua')) {
    $set[]          = 'rua = :rua';
    $params[':rua'] = s($in['rua'] ?? '', 200);
}
if ($keyPresent('numero')) {
    $set[]             = 'numero = :numero';
    $params[':numero'] = s($in['numero'] ?? '', 20);
}
if ($keyPresent('bairro')) {
    $set[]             = 'bairro = :bairro';
    $params[':bairro'] = s($in['bairro'] ?? '', 100);
}
if ($keyPresent('cidade')) {
    $set[]             = 'cidade = :cidade';
    $params[':cidade'] = s($in['cidade'] ?? '', 100);
}
if ($sent('estado')) {
    $v = strtoupper(s($in['estado'], 2));
    if (strlen($v) !== 2 || !ctype_alpha($v)) {
        json_err('UF inválida (use 2 letras).', 400, 'ERR_UF');
    }
    $set[]             = 'estado = :estado';
    $params[':estado'] = $v;
}

// === SENHA (opcional — exige os 3 campos) ========================
if ($sent('senha_nova') || $sent('senha_atual') || $sent('senha_nova_confirma')) {
    $atual    = (string)($in['senha_atual']         ?? '');
    $nova     = (string)($in['senha_nova']          ?? '');
    $confirma = (string)($in['senha_nova_confirma'] ?? '');

    if ($atual === '' || $nova === '' || $confirma === '') {
        json_err('Para trocar a senha preencha os 3 campos (atual, nova e confirmação).',
                 400, 'ERR_PASSWORD_FIELDS');
    }
    if (!password_verify($atual, (string)$me['senha_hash'])) {
        json_err('A senha atual está incorreta.', 401, 'ERR_PASSWORD_WRONG');
    }
    if (!is_strong_password($nova)) {
        json_err('Nova senha fraca: mínimo 8 caracteres, 1 maiúscula, 1 número e 1 símbolo.',
                 400, 'ERR_PASSWORD_WEAK');
    }
    if ($nova !== $confirma) {
        json_err('A confirmação da nova senha não bate.', 400, 'ERR_PASSWORD_MATCH');
    }
    if ($nova === $atual) {
        json_err('A nova senha precisa ser diferente da atual.', 400, 'ERR_PASSWORD_SAME');
    }
    $set[]                 = 'senha_hash = :senha_hash';
    $params[':senha_hash'] = password_hash($nova, PASSWORD_BCRYPT);
}


/* ── Nada a atualizar? ────────────────────────────────────────────── */
if (empty($set)) {
    json_err('Nenhum campo para atualizar.', 400, 'ERR_NO_FIELDS');
}


/* ── UPDATE ───────────────────────────────────────────────────────── */
$params[':id'] = $meId;
$sql  = 'UPDATE usuarios SET ' . implode(', ', $set) . ' WHERE id = :id AND deleted_at IS NULL';
$stmt = $pdo->prepare($sql);
$stmt->execute($params);


/* ── Devolve dados atualizados ────────────────────────────────────── */
$stmt = $pdo->prepare(
   'SELECT id, username, nome_display, nome_completo, email,
           cpf_cnpj, telefone, telefone2,
           DATE_FORMAT(data_nasc, "%d/%m/%Y") AS data_nasc,
           sobre, foto_perfil, foto_banner,
           cep, rua, numero, bairro, cidade, estado
    FROM usuarios WHERE id = ? LIMIT 1'
);
$stmt->execute([$meId]);
$user = $stmt->fetch();
$user['id'] = (int)$user['id'];

json_ok([
    'user'    => $user,
    'message' => 'Perfil atualizado com sucesso.',
]);
