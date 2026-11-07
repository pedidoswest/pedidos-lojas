// Preencha com os dados do seu projeto Supabase (Settings > API).
// A chave "anon public" pode ficar aqui: ela é pública por desenho e quem protege os dados são as regras do schema.sql.
// NUNCA coloque a chave "service_role" neste arquivo.
window.APP_CONFIG = {
  SUPABASE_URL: "https://yjndbuzhrebhzspeihbt.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_cI70yFudSoHeeQS1ClS75g_4EN3KPUD",
  // Mesmo valor usado no script criar-usuarios.mjs. O gerente nunca vê isso: ele digita só "loja03".
  EMAIL_DOMAIN: "lojas.example.com"
};
