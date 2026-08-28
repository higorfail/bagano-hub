import type { NextConfig } from "next";

// Onde o hub é servido dentro do domínio.
//
// Vem de variável de ambiente, não fixo aqui, porque isto é decisão de
// infraestrutura: servir em `baganomkt.com/hub` ou em `hub.baganomkt.com` passa
// a ser mudar uma variável na Vercel, e não reescrever os ~40 lugares do código
// que montam caminho absoluto.
//
// Vazio = hub na raiz do domínio (é como `bagano-hub.vercel.app` funciona hoje,
// e por isso nada muda enquanto a variável não for definida).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''

const nextConfig: NextConfig = {
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
};

export default nextConfig;
