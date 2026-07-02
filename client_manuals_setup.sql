-- ============================================================
-- client_manuals: schema + seed de todos os 19 clientes Bagano
-- Execute no Supabase → SQL Editor
-- Para atualizar um cliente: DELETE FROM client_manuals WHERE souschef_slug = 'slug'; depois re-execute.
-- ============================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  1. SCHEMA                                                       │
-- └─────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS client_manuals (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID        REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
  souschef_slug    TEXT,
  tagline          TEXT,
  concept          TEXT,
  history          TEXT,
  pillars          JSONB       DEFAULT '[]'::jsonb,
  colors           JSONB       DEFAULT '[]'::jsonb,
  fonts            JSONB       DEFAULT '[]'::jsonb,
  address          TEXT,
  phone            TEXT,
  hours            JSONB       DEFAULT '{}'::jsonb,
  instagram        TEXT,
  website          TEXT,
  delivery_links   JSONB       DEFAULT '[]'::jsonb,
  menu             JSONB       DEFAULT '[]'::jsonb,
  differentials    JSONB       DEFAULT '[]'::jsonb,
  promotions       JSONB       DEFAULT '[]'::jsonb,
  events           JSONB       DEFAULT '[]'::jsonb,
  tone_of_voice    JSONB       DEFAULT '{}'::jsonb,
  personas         JSONB       DEFAULT '[]'::jsonb,
  editorial_pillars JSONB      DEFAULT '[]'::jsonb,
  content_series   JSONB       DEFAULT '[]'::jsonb,
  production_notes TEXT,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE client_manuals ENABLE ROW LEVEL SECURITY;

DO $plpg$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'client_manuals' AND policyname = 'client_manuals_access'
  ) THEN
    EXECUTE 'CREATE POLICY "client_manuals_access" ON client_manuals FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $plpg$;


-- ┌─────────────────────────────────────────────────────────────────┐
-- │  2. SEED                                                         │
-- └─────────────────────────────────────────────────────────────────┘

-- ── Number Seven ──────────────────────────────────────────────────
INSERT INTO client_manuals (
  client_id, souschef_slug, tagline, concept, history,
  pillars, colors, fonts, address, phone, hours, instagram, website, delivery_links,
  menu, differentials, promotions, events, tone_of_voice, personas, editorial_pillars,
  content_series, production_notes
)
SELECT c.id, 'number-seven',
  'Soul Time · onde a alma encontra alimento',
  'Fine dining restaurant celebrating life through unforgettable gastronomic experiences by the sea',
  'Inaugurado setembro 2009, Avenida Atlântica, BC. Chef Denis Ceratti lidera a cozinha; sócios Mario Del Monte e Gil Riback. 17 anos de legado atravessando gerações.',
  $$[{"name":"Gastronomia","description":"Autoral · Chef Denis"},{"name":"Arte","description":"Galeria Seven and Arts"},{"name":"Vinho","description":"Adega 1.400+ rótulos"},{"name":"Vista","description":"Beira mar · Avenida Atlântica"}]$$::jsonb,
  $$[]$$::jsonb,
  $$[]$$::jsonb,
  'Avenida Atlântica, 400 · Pioneiros · Balneário Camboriú · SC · 88330-000',
  '(47) 3361-0057',
  $${"terça-sexta":"19h às 23h","sábado":"12h às 23h","domingo":"12h às 16h","segunda":"Fechado"}$$::jsonb,
  '@restaurantenumberseven', 'numberseven.com.br', $$[]$$::jsonb,
  $$[{"category":"Entradas","items":[{"name":"Couvert","price":"R$ 42","description":"Pães fermentação natural, requeijão pipoca, charcuteria"},{"name":"Vitello a Seven","price":"R$ 65","description":"Rosbife angus, aioli atum, aliche"},{"name":"Gravlax Salmão","price":"R$ 69","description":"Salmão curado beterraba, pão bao, relish pepino"}]},{"category":"Pratos Principais","items":[{"name":"Polvo Catarinense","price":"R$ 169","description":"Polvo grelhado, arroz rubi, chimichurri"},{"name":"Bacalhau Assado","price":"R$ 180","description":"Batatinhas, cebolas tostadas, azeitona siciliana"},{"name":"Filé ao Poivre","price":"R$ 119","description":"Fettuccine, cogumelos manteiga, cebolinha"}]}]$$::jsonb,
  $$["Vista beira mar – Avenida Atlântica 400","Adega 1.400+ rótulos com sommelier Patrick","Galeria Seven and Arts – obras brasileiras","17 anos de legado geracional","Cozinha autoral Chef Denis","Pet friendly"]$$::jsonb,
  $$[{"title":"Menu Editions","description":"Menu rotativo entrada, prato, sobremesa R$ 97,90+, assinado Chef Denis"},{"title":"Rolha Free","description":"Terça a quinta: cliente traz próprio vinho sem taxa"},{"title":"Feijoada Sábado","description":"Todo sábado almoço tradicional beira mar"}]$$::jsonb,
  $$[{"date":"Junho 12","title":"Dia dos Namorados","description":"Campanhas em desenvolvimento"},{"date":"Agosto 11","title":"Dia dos Pais","description":"Data forte, comunicação antecipada"},{"date":"Setembro 1","title":"Aniversário 17 anos","description":"Jantar comemorativo com música ao vivo"},{"date":"Dezembro 24-31","title":"Ceia e Réveillon","description":"Menus harmonizados, reserva antecipada"}]$$::jsonb,
  $${"personality":"Sofisticado, acolhedor, sensorial","use_words":["Soul Time","apreciar","experiência","harmoniza","conexão","privilégio","genuinamente","inesquecível","requinte"],"avoid_words":["promoção","desconto","imperdível","só hoje","corre","barato","emojis","gírias"],"taglines":["Soul Time","É um empreendimento que envolve almas e desejos"]}$$::jsonb,
  $$[{"name":"Roberto","age":"57","profile":"Engenheiro aposentado de São Paulo, apartamento de verão em BC","behaviors":"Frequenta o Number Seven há anos, pede o clássico favorito"},{"name":"Mariana","age":"29","profile":"Arquiteta em BC com firma crescendo","behaviors":"Acompanha o Menu Editions todo mês, usa delivery quando não pode ir pessoalmente"}]$$::jsonb,
  $$[{"name":"Humanizado","description":"Ritual, mesa, cliente, detalhe, luz – desejo, não só produto"},{"name":"Legado","description":"17 anos, Chef Denis, sócios, história, trajetória"},{"name":"Sensorial","description":"Sons, vista mar, luz, taça – experiência sensorial sem fala"},{"name":"Autoridade gastronômica","description":"Chef Denis, sommelier Patrick, bastidores da cozinha"},{"name":"Venda recorrente","description":"Menu Editions, Rolha Free, Feijoada – comunicação consistente"},{"name":"Combinações","description":"Momentos: aniversário, jantar a dois, pós-praia, corporativo"}]$$::jsonb,
  $$[{"name":"Por Trás do Seven","description":"Humanização da equipe: garçom, bartender, sous chef, Chef Denis","frequency":"Mensal"},{"name":"Chef Denis em Ação","description":"Reels do Chef Denis preparando o prato do mês","frequency":"Mensal"},{"name":"Adega & Sommelier Patrick","description":"Ritual de escolha do vinho na adega","frequency":"Recorrente"},{"name":"Sons do Seven","description":"Conteúdo sensorial sem fala – ASMR do preparo","frequency":"Recorrente"}]$$::jsonb,
  'Luz baixa, mesa posta, atmosfera noturna intimista, câmera na altura da mesa. Explorar vista da Atlântica, adega, arte. Clientes e equipe com autorização. Cenas reais, naturalidade.'
FROM clients c
WHERE c.sous_chef_url LIKE '%#number-seven%' OR c.name ILIKE '%Number Seven%'
LIMIT 1
ON CONFLICT (client_id) DO NOTHING;


-- ── Piastro Cucina ────────────────────────────────────────────────
INSERT INTO client_manuals (
  client_id, souschef_slug, tagline, concept, history,
  pillars, colors, fonts, address, phone, hours, instagram, website, delivery_links,
  menu, differentials, promotions, events, tone_of_voice, personas, editorial_pillars,
  content_series, production_notes
)
SELECT c.id, 'piastro-cucina',
  'Onde cada prato se torna o astro da sua mesa',
  'Culinária italiana contemporânea com massas frescas, pizzas de forno a lenha e ingredientes catarinenses',
  'Inaugurado no final de 2025 dentro do Botanique Food Hall. Quatro chefs sócios: Denis Ceratti, Vinicius Branco, Victor Branco e Alan Marcos.',
  $$[{"name":"Quattro Chef Soci","description":"Denis, Vinicius, Victor e Alan – quatro assinaturas em uma cozinha"},{"name":"Massas Frescas","description":"Produzidas na casa diariamente"},{"name":"Forno a Lenha","description":"Pizzas romanas finas e crocantes"},{"name":"Ingredientes Locais","description":"Queijos de SC: Pomerode, Blumenau, Perimbó"}]$$::jsonb,
  $$[{"name":"Verde profundo","hex":"#004733"},{"name":"Cacao creme","hex":"#DFCDB5"},{"name":"Parmigiano","hex":"#4B3C35"},{"name":"Vinho Alloro","hex":"#81000D"}]$$::jsonb,
  $$[{"role":"Principal","family":"Nohemi (sans serif)"}]$$::jsonb,
  'Rua 3300, 87 · 2º piso · Botanique Food Hall · Centro · Balneário Camboriú · SC',
  'piastrocucina@gmail.com',
  $${"terça-quinta":"11h30-14h, 18h-23h","sexta":"11h30-14h30, 18h-23h","sábado-domingo":"12h-14h30, 17h-23h","segunda":"Fechado"}$$::jsonb,
  '@piastrocucina', 'linktr.ee/piastrocucina', $$["iFood"]$$::jsonb,
  $$[{"category":"Insalatas","items":[{"name":"Brie","price":"R$ 49","description":"Folhas, brie, tomate cereja, crostine, geleia de morango"}]},{"category":"Massas","items":[{"name":"Bigoli al Pesto","price":"R$ 49","description":"Massa fresca, pesto, stracciatella"},{"name":"Tagliolini al Ragu","price":"R$ 67","description":"Massa fresca, ragù de carne, pomodoro, gran formaggio"},{"name":"Spaghetti al Limoni","price":"R$ 84","description":"Massa fresca, camarão, nata, limão siciliano, bottarga"}]},{"category":"Pizza Romana","items":[{"name":"Marguerita","price":"R$ 55","description":"Molho tomate, fior di latte, tomate cereja, basil"},{"name":"Prosciutto","price":"R$ 77","description":"Molho tomate, fior di latte, prosciutto Parma, rúcula"}]}]$$::jsonb,
  $$["Quatro chefs sócios com assinaturas individuais","Localização premium no Botanique Food Hall","Massas frescas produzidas na casa com ingredientes catarinenses","Forno a lenha para pizzas e entradas","Novidade – aberto no final de 2025","Sofisticação acessível do clássico ao elaborado"]$$::jsonb,
  $$[{"title":"Balneário Saboroso 2026","description":"Festival julho 3-31, menu R$ 119 com entrada, prato e sobremesa"},{"title":"Astro Club","description":"Clube comunidade para engajamento e fidelidade"},{"title":"Pizza Romana all day","description":"Pizzas romanas disponíveis o dia todo durante o serviço"}]$$::jsonb,
  $$[{"date":"Julho 3-31","title":"Balneário Saboroso 2026","description":"Festival gastronômico, menu exclusivo Odisseia dos Sabores"},{"date":"Julho 10","title":"Dia da Pizza","description":"Data natural e forte para a marca"},{"date":"Fevereiro 21","title":"Dia Nacional do Imigrante Italiano","description":"Conexão direta com o DNA da marca"}]$$::jsonb,
  $${"personality":"Italiano contemporâneo, caloroso, descontraído mas sofisticado","use_words":["astro","cucina","dividir","reunir à mesa","massa fresca","artesanal","buon appetito","protagonista"],"avoid_words":["promoção","imperdível","só hoje","corre","barato","emojis"],"taglines":["Onde cada prato se torna o astro da sua mesa","Lascia che la pizza sia la astro della tua giornata"]}$$::jsonb,
  $$[{"name":"Marina","age":"34","profile":"Advogada em BC apaixonada por gastronomia e vinho","behaviors":"Janta com amigos ou casal, busca experiências sofisticadas e segue restaurantes novos"},{"name":"Renato","age":"45","profile":"Empresário imobiliário com família, habituado a alto padrão","behaviors":"Jantares de fim de semana com família, valoriza ambiente aconchegante e cardápio variado"}]$$::jsonb,
  $$[{"name":"Conteúdo humanizado","description":"Pessoas, gestos, calor da mesa italiana – além da foto do prato"},{"name":"Os quatro chefs","description":"Sócios como rostos da marca, bastidores e dinâmica"},{"name":"Bastidores da cozinha","description":"Forno a lenha, abertura de massa, queijo derretendo"},{"name":"Campanhas e engajamento","description":"Ações que geram conexão e compartilhamento"},{"name":"Patrocinados","description":"Facebook e Instagram Ads para conversão"},{"name":"Parcerias estratégicas","description":"Colaborações dentro do ecossistema Botanique"}]$$::jsonb,
  $$[{"name":"Corte em foco","description":"Reels recorrentes destacando um prato ou massa por edição com ASMR","frequency":"Recorrente"}]$$::jsonb,
  'Mesa posta, luz quente, foco no prato astro. Textura da massa, queijo derretendo, borda da pizza. Quatro parceiros em ação, clientes dividindo pratos. Estética italiana clássica com calor.'
FROM clients c
WHERE c.sous_chef_url LIKE '%#piastro-cucina%' OR c.name ILIKE '%Piastro%'
LIMIT 1
ON CONFLICT (client_id) DO NOTHING;


-- ── Fiorellato Sorvetes ───────────────────────────────────────────
INSERT INTO client_manuals (
  client_id, souschef_slug, tagline, concept, history,
  pillars, colors, fonts, address, phone, hours, instagram, website, delivery_links,
  menu, differentials, promotions, events, tone_of_voice, personas, editorial_pillars,
  content_series, production_notes
)
SELECT c.id, 'fiorellato-sorvetes',
  'A sorveteria que transforma o simples',
  'Gelateria premium artesanal com composições em camadas personalizadas e experiência sensorial',
  'Inaugurada no Botanique 3300 pelo casal Denis e Fabi. Missão: transformar o simples prazer do sorvete em experiência fotografável e afetiva.',
  $$[{"name":"Montagem Personalizada","description":"Composição de sabores, caldas, crocantes e finalizações por pedido"},{"name":"Experiência Visual","description":"Sorvete elevado a experiência instagramável"},{"name":"Pet Friendly","description":"Potinho especial desenvolvido com nutricionistas animais"},{"name":"Lançamentos","description":"Novos sabores sazonais como eventos"}]$$::jsonb,
  $$[]$$::jsonb,
  $$[{"role":"Principal","family":"Lato (sans serif, traço artesanal)"}]$$::jsonb,
  'Rua 3300, 87 · Botanique 3300 · Centro · Balneário Camboriú · SC',
  '(47) 99925-0106',
  $${"terça-domingo":"11h às 23h","segunda":"Fechado"}$$::jsonb,
  '@fiorellato.sorvetes', 'linktr.ee/fiorellato.sorvetes', $$[]$$::jsonb,
  $$[{"category":"Sorvete","items":[{"name":"Pote · 1 bola","price":"R$ 24","description":"Uma bola de sorvete artesanal no pote"},{"name":"Pote · 2 bolas","price":"R$ 27","description":"Duas bolas de sorvete artesanal no pote"},{"name":"Casquinha · 2 bolas","price":"R$ 30","description":"Duas bolas na casquinha"}]},{"category":"Casquinhas Autorais · Dulce & Formaggio","items":[{"name":"Triplo Chocolate","price":"R$ 32-34,90","description":"Sorvete chocolate, ganache leite, mini brigadeiros"},{"name":"Fior di Pistacchio","price":"R$ 38-41","description":"Sorvete pistache, caramelo pistache, pistache tostado, ganache"},{"name":"Dulce de Leite","price":"R$ 30-32","description":"Dulce de leche, gran formaggio, crocante de cereal"}]}]$$::jsonb,
  $$["Linha autoral Dulce & Formaggio – composições exclusivas da casa","Sorvete pet friendly desenvolvido com nutricionistas animais","Renovação constante com lançamentos sazonais","Localização premium no Botanique 3300 com fluxo qualificado","Apresentação instagramável e fotogênica"]$$::jsonb,
  $$[{"title":"Casquinhas Autorais","description":"Linha Dulce & Formaggio com sorvete, calda, crocante e finalização"},{"title":"Sorvete Pet Friendly","description":"Potinho 100% seguro desenvolvido com especialistas em nutrição animal"},{"title":"Lançamentos sazonais","description":"Novos sabores como cookie e edições especiais"}]$$::jsonb,
  $$[{"date":"Julho 23","title":"Dia Nacional do Sorvete","description":"Data principal da marca"},{"date":"Setembro 23","title":"Dia do Sorvete","description":"Segunda celebração do ano"},{"date":"Dezembro-Março","title":"Alta Temporada","description":"Pico de turismo em BC"}]$$::jsonb,
  $${"personality":"Amigável, espontâneo, energético e visual","use_words":["camadas","artesanal","texturas","montagem","autoral","derreter","crocante"],"avoid_words":["industrializado","comum","só hoje","corre"],"taglines":["A sorveteria que transforma o simples","Onde a magia acontece em camadas"]}$$::jsonb,
  $$[{"name":"Giovanna","age":"Designer gráfica","profile":"Classe média alta em BC, ama locais novos que combinam sabor e estética","behaviors":"Corre na Atlântica nos fins de semana, encontra amigas para sobremesa, compartilha no Instagram"},{"name":"Eduardo","age":"Engenheiro","profile":"Classe A, pai de dois filhos e um Labrador Thor","behaviors":"Passeios na Atlântica com família – fez do Fiorellato parada obrigatória pelo sorvete pet"}]$$::jsonb,
  $$[{"name":"O processo da montagem","description":"Colher pegando sorvete, camadas sendo construídas, finalização"},{"name":"Reação e desejo","description":"Vitrine colorida, escolha do sabor, momento de provar"},{"name":"Pet friendly","description":"Pet tomando sorvete próprio – conteúdo afetivo e diferenciador"},{"name":"Lançamentos","description":"Cada sabor novo como evento: carrossel + reels"}]$$::jsonb,
  $$[{"name":"Sabor do Mês","description":"Apresentação do novo sabor com processo e destaques visuais","frequency":"Mensal"}]$$::jsonb,
  'Luz natural, vitrine colorida, detalhe da colher em ação. Camadas sendo construídas. Momento de provar. Pet com sorvete próprio – conteúdo afetivo. Cores vibrantes, estética leve de praia.'
FROM clients c
WHERE c.sous_chef_url LIKE '%#fiorellato-sorvetes%' OR c.name ILIKE '%Fiorellato%'
LIMIT 1
ON CONFLICT (client_id) DO NOTHING;


-- ── Satō Sushi ────────────────────────────────────────────────────
INSERT INTO client_manuals (
  client_id, souschef_slug, tagline, concept, history,
  pillars, colors, fonts, address, phone, hours, instagram, website, delivery_links,
  menu, differentials, promotions, events, tone_of_voice, personas, editorial_pillars,
  content_series, production_notes
)
SELECT c.id, 'sato-sushi',
  'Autenticidade japonesa com alma catarinense',
  'Culinária japonesa premium combinando tradição, técnica e ingredientes frescos em um ambiente sofisticado',
  'Sushi premium no centro de BC, celebrando momentos de prazer e conexão com autenticidade japonesa e ingredientes catarinenses.',
  $$[{"name":"Autenticidade","description":"Tradição japonesa com precisão técnica"},{"name":"Frescor","description":"Ingredientes frescos diariamente"},{"name":"Inovação","description":"Releituras autorais com técnica"},{"name":"Experiência","description":"Gastronomia como celebração"}]$$::jsonb,
  $$[]$$::jsonb,
  $$[]$$::jsonb,
  'Rua 2380, 33 · Centro · Balneário Camboriú · SC · 88330-494',
  '(47) 2125-9033',
  $${"terça-quinta e domingo":"19h-23h","sexta-sábado":"19h-00h","segunda":"Fechado","último domingo do mês":"Fechado"}$$::jsonb,
  '@satosushibc', 'linktr.ee/satosushibc', $$["iFood","Delivery Direto"]$$::jsonb,
  $$[{"category":"Festival Livre","items":[{"name":"Rodízio – reposição contínua","price":"Consultar","description":"Variedade e experiência presencial"}]},{"category":"À la carte","items":[{"name":"Combinado Premium","price":"Consultar","description":"Peças autorais mais elogiadas pelos clientes"},{"name":"Temaki","price":"Consultar","description":"Clássico da casa"},{"name":"Ceviche Crispy","price":"Consultar","description":"Releitura com textura crocante – prato assinatura"}]}]$$::jsonb,
  $$["Festival livre – rodízio com reposição contínua de peças","Clube Satô – programa de fidelidade para recorrência","Menu Experiência Satō – degustação rotativa edição limitada","Noite Premium – eventos com DJ e harmonização de saquês","Técnica de corte preciso realçando frescor do peixe"]$$::jsonb,
  $$[{"title":"Festival Livre","description":"Rodízio japonês com reposição contínua de peças e combinados"},{"title":"Clube Satô","description":"Programa de fidelidade para premiar clientes recorrentes"},{"title":"Menu Experiência Satō","description":"Degustação rotativa com posicionamento de edição limitada"},{"title":"Noite Premium","description":"Eventos com DJ e harmonização de saquês"}]$$::jsonb,
  $$[{"date":"Setembro 5","title":"Dia da Gastronomia Japonesa","description":"Data principal da marca"},{"date":"Novembro 1","title":"Dia do Sushi","description":"Celebração natural"},{"date":"Dezembro-Março","title":"Alta temporada","description":"Pico de turismo em BC"}]$$::jsonb,
  $${"personality":"Sofisticado, acolhedor, instigante","use_words":["frescor","corte preciso","experiência","autenticidade","celebrar"],"avoid_words":["barato","só hoje","corre","genérico"],"taglines":["Autenticidade japonesa com alma catarinense","Corte preciso, frescor absoluto, experiência única"]}$$::jsonb,
  $$[{"name":"Turista experiencial","age":"25-45","profile":"Busca experiências memoráveis, disposto a pagar por qualidade","behaviors":"Adora pratos instagramáveis e sofisticados"},{"name":"Morador premium","age":"30-50","profile":"Profissionais liberais e empresários valorizando consistência","behaviors":"Busca constância, qualidade e prestígio"},{"name":"Millennials delivery","age":"20-35","profile":"Busca conveniência e valor com fotos atraentes","behaviors":"Fiel à marca, combina sabor com praticidade"}]$$::jsonb,
  $$[{"name":"Bastidores do preparo","description":"Chef em ação, cortes precisos, montagem das peças com ASMR"},{"name":"Lifestyle noturno","description":"Conteúdo aspiracional conectando Satō ao estilo de vida de BC"},{"name":"Frescor do peixe","description":"Jornada do ingrediente até a mesa"},{"name":"Relacionamento e eventos","description":"Clube Satô, Menu Experiência, Noite Premium"}]$$::jsonb,
  $$[{"name":"Corte em foco","description":"Reels recorrentes destacando peça ou corte do mês com ASMR","frequency":"Recorrente"}]$$::jsonb,
  'Close no corte preciso, brilho do peixe, montagem das peças. ASMR da faca. Conteúdo aspiracional noturno. Ambiente sofisticado, luz controlada, estética premium contemporânea.'
FROM clients c
WHERE c.sous_chef_url LIKE '%#sato-sushi%' OR c.name ILIKE '%Sat_o%' OR c.name ILIKE '%Sato Sushi%'
LIMIT 1
ON CONFLICT (client_id) DO NOTHING;


-- ── Donna Pizzeria ────────────────────────────────────────────────
INSERT INTO client_manuals (
  client_id, souschef_slug, tagline, concept, history,
  pillars, colors, fonts, address, phone, hours, instagram, website, delivery_links,
  menu, differentials, promotions, events, tone_of_voice, personas, editorial_pillars,
  content_series, production_notes
)
SELECT c.id, 'donna-pizzeria',
  'Cada fatia, um pedaço de alegria',
  'Pizzaria delivery gourmet com massa artesanal de longa fermentação e forno a lenha',
  'Idealizada por Fabrício, gestor do mundo das pizzarias. Janaína entrou como sócia para estrutura e escala. Crescimento mensal positivo desde o lançamento.',
  $$[{"name":"Gourmet","description":"Ingredientes premium e preparo cuidadoso"},{"name":"Artesanal","description":"Massa feita à mão com longa fermentação"},{"name":"Forno a Lenha","description":"Preparo tradicional para massa leve e crocante"},{"name":"Entrega","description":"Embalagem térmica que mantém a pizza quentinha"}]$$::jsonb,
  $$[]$$::jsonb,
  $$[]$$::jsonb,
  'Rua Monte Pitangueira, 459 · Monte Alegre · Camboriú · SC · 88348-535',
  '(47) 99785-1212',
  $${"domingo-quinta":"18h-23h30","sexta-sábado":"18h-00h"}$$::jsonb,
  '@donnadinapolibr', 'donnapizzeria.com.br', $$["iFood","Site próprio"]$$::jsonb,
  $$[{"category":"Pizzas Salgadas","items":[{"name":"Variedades gourmet","price":"Consultar site","description":"Massa leve de longa fermentação, forno a lenha, ingredientes premium"}]},{"category":"Pizzas Doces","items":[{"name":"Opções sazonais","price":"Consultar","description":"Sobremesas para fechar a refeição"}]}]$$::jsonb,
  $$["Massa artesanal de longa fermentação – leve e digestiva","Forno a lenha para resultado crocante e autêntico","Embalagem térmica que mantém a pizza quentinha até o último pedaço","Crescimento mensal consistente desde o lançamento"]$$::jsonb,
  $$[{"title":"Segunda Maluca","description":"Segunda-feira: compre uma gigante e ganhe outra (sabores selecionados)"},{"title":"Sabor do Mês","description":"Sabor especial rotativo destacado na comunicação mensal"}]$$::jsonb,
  $$[{"date":"Julho 10","title":"Dia da Pizza","description":"Data principal da marca"},{"date":"Setembro","title":"Aniversário Donna","description":"Pizza votada pelos seguidores"},{"date":"Páscoa","title":"Sabores de edição limitada","description":"Combos família e pizzas especiais"}]$$::jsonb,
  $${"personality":"Afetivo, leve, da vida real","use_words":["quentinha","conforto","em casa","afeto","forno a lenha","desejo"],"avoid_words":["sofisticado demais","frio","distante"],"taglines":["Cada fatia, um pedaço de alegria","Seu desejo tem nome: Donna Pizzeria"]}$$::jsonb,
  $$[{"name":"Público feminino jovem","age":"25","profile":"Vida ativa, consciência estética, busca conveniência","behaviors":"Aprecia refeição prática, leve e saborosa para pedir no delivery"}]$$::jsonb,
  $$[{"name":"Foodporn e desejo","description":"Queijo puxando, vapor subindo, close no corte – fome imediata"},{"name":"Cena real em casa","description":"Ritual de abrir a caixa, mesa posta, sexta com série e pizza"},{"name":"Bastidores e qualidade","description":"Preparo, ingredientes, forno a lenha, equipe"},{"name":"Promoções e recorrência","description":"Segunda Maluca, sabor do mês, avisos de fluxo"}]$$::jsonb,
  $$[{"name":"Sabor do Mês","description":"Apresentação do sabor especial com processo e destaques","frequency":"Mensal"}]$$::jsonb,
  'Close no queijo puxando, vapor, corte. Cenas reais sem produção artificial. Vibe de sexta à noite. Embalagem térmica preservando calor. Estética urbana e acessível.'
FROM clients c
WHERE c.sous_chef_url LIKE '%#donna-pizzeria%' OR c.name ILIKE '%Donna%Pizz%'
LIMIT 1
ON CONFLICT (client_id) DO NOTHING;


-- ── Zebuino Parrilla ──────────────────────────────────────────────
INSERT INTO client_manuals (
  client_id, souschef_slug, tagline, concept, history,
  pillars, colors, fonts, address, phone, hours, instagram, website, delivery_links,
  menu, differentials, promotions, events, tone_of_voice, personas, editorial_pillars,
  content_series, production_notes
)
SELECT c.id, 'zebuino-parrilla',
  'Sol, família, amigos e carne',
  'Parrilla de inspiração uruguaia e argentina com carnes nobres e fogo de chão na Marina de Itajaí',
  'Parrilla na Marina de Itajaí celebrando a cultura do encontro em torno da brasa. Fogo de chão como protagonista.',
  $$[{"name":"Fogo","description":"Fogo de chão como coração da casa"},{"name":"Carnes Nobres","description":"Cortes premium com técnica de parrilla"},{"name":"Encontro","description":"Cultura do encontro e reunião"},{"name":"Vista Marina","description":"Barcos e pôr do sol na Marina de Itajaí"}]$$::jsonb,
  $$[{"name":"Preto","hex":"#151515"},{"name":"Branco","hex":"#FFFFFF"},{"name":"Vermelho","hex":"#E23D3D"}]$$::jsonb,
  $$[{"role":"Principal","family":"Startup Sans"}]$$::jsonb,
  'Avenida Carlos Ely Castro, 100 · Centro · Itajaí · SC · 88301-445',
  '(47) 99147-4775',
  $${"terça-quinta":"11h30-15h, 19h-23h","sexta-sábado":"11h30-23h","domingo":"11h30-17h","segunda":"Fechado"}$$::jsonb,
  '@zebuinoparrilla', '', $$[]$$::jsonb,
  $$[{"category":"Parrilla","items":[{"name":"Cortes nobres na brasa","price":"Consultar cardápio","description":"Carnes premium grelhadas no fogo de chão com acompanhamentos"}]},{"category":"Menu Zecutivo","items":[{"name":"Almoço executivo","price":"Melhor custo","description":"Opção ágil para almoços de semana"}]},{"category":"ZeBuino Love","items":[{"name":"Menu especial","price":"R$ 227 p/pessoa","description":"Entrada + principal à escolha + sobremesa – menu de data"}]}]$$::jsonb,
  $$["Fogo de chão como protagonista da experiência","Vista privilegiada para a Marina de Itajaí com barcos","Menu Zecutivo – almoço executivo para a semana","Cortes nobres com técnica de parrilla uruguaia-argentina","Menus sazonais especiais como o ZeBuino Love"]$$::jsonb,
  $$[{"title":"Menu Zecutivo","description":"Almoço executivo com melhor custo e agilidade para clientes de semana"},{"title":"Menus de data","description":"ZeBuino Love e outras especialidades sazonais"}]$$::jsonb,
  $$[{"date":"Junho 12","title":"Dia dos Namorados – ZeBuino Love","description":"Menu especial do casal"}]$$::jsonb,
  $${"personality":"Instintivo, primitivo, caloroso","use_words":["fogo","brasa","parrilla","ponto certo","encontro","memorável"],"avoid_words":["só hoje","corre","barato"],"taglines":["Sol, família, amigos e carne","Fogo que transforma o simples em memorável"]}$$::jsonb,
  $$[{"name":"Público do encontro","age":"Variado","profile":"Famílias e grupos de amigos que valorizam carne e reunião","behaviors":"Almoços e jantares na Marina, reuniões de amigos em torno da brasa"}]$$::jsonb,
  $$[{"name":"O ritual do fogo","description":"Carne selando na brasa, som, fumaça, ponto perfeito"},{"name":"Vista da Marina","description":"Barcos, luz do pôr do sol, ambiente como parte da experiência"},{"name":"Encontro e mesa cheia","description":"Família e amigos reunidos em torno da carne"},{"name":"Menus e datas","description":"Zecutivo no almoço e menus especiais sazonais"}]$$::jsonb,
  $$[{"name":"Noites na Marina","description":"Capturando a atmosfera da Marina ao entardecer","frequency":"Recorrente"}]$$::jsonb,
  'Carne selando na brasa, som da fumaça, ponto certo. Barcos na Marina ao fundo, luz do fim de tarde. Família e amigos. ASMR das chamas. Rústico e quente.'
FROM clients c
WHERE c.sous_chef_url LIKE '%#zebuino-parrilla%' OR c.name ILIKE '%Zebuino%'
LIMIT 1
ON CONFLICT (client_id) DO NOTHING;


-- ── Uni Zushi ─────────────────────────────────────────────────────
INSERT INTO client_manuals (
  client_id, souschef_slug, tagline, concept, history,
  pillars, colors, fonts, address, phone, hours, instagram, website, delivery_links,
  menu, differentials, promotions, events, tone_of_voice, personas, editorial_pillars,
  content_series, production_notes
)
SELECT c.id, 'uni-zushi',
  'Sushi de assinatura, do clássico ao premium',
  'Culinária japonesa premium do nigiri ao clássico, passando por cortes nobres e releituras autorais',
  'Culinária japonesa premium no Balneário Shopping, com foco em variedade, cortes especiais e precisão técnica.',
  $$[{"name":"Cortes Nobres","description":"Wagyu, atum azul, vieira com manteiga e trufas"},{"name":"Cardápio Amplo","description":"Do nigiri ao sashimi de 18 cortes"},{"name":"Releituras Autorais","description":"Pratos como Crispy Rice e Snack Tartar com técnica e textura"},{"name":"Precisão Técnica","description":"Corte preciso realçando frescor do peixe"}]$$::jsonb,
  $$[]$$::jsonb,
  $$[{"role":"Títulos","family":"The Seasons, Biro Script, Quilin, Heaters"},{"role":"Apoio","family":"Bebas Neue, TT Commons Pro"}]$$::jsonb,
  'Avenida Santa Catarina, 1 · Salas 517-518 · L1 · Balneário Shopping · Balneário Camboriú · SC · 88339-005',
  '(47) 99286-1277',
  $${"todos os dias":"11h-23h"}$$::jsonb,
  '@unizushisc', 'bio.site/menusUNI', $$[]$$::jsonb,
  $$[{"category":"Carpaccios & Cortes Frios","items":[{"name":"Carpaccio de Wagyu","price":"R$ 109","description":"Cortes finos de wagyu levemente flambados, ponzu, togarashi, sal"},{"name":"Sashimi Frutos do Mar · 18 cortes","price":"R$ 139","description":"Seleção premium de peixes e frutos do mar pelo chef"},{"name":"Carpaccio de Salmão Trufado","price":"R$ 59","description":"Salmão com azeite de trufas brancas"}]},{"category":"Entradas Quentes","items":[{"name":"Missoshiro","price":"R$ 16","description":"Caldo missô com cebolinha"},{"name":"Kakiage","price":"R$ 29","description":"Tempurá crocante de milho"}]}]$$::jsonb,
  $$["Cortes nobres que poucos concorrentes oferecem – wagyu, atum azul, vieira","Cardápio amplo do clássico ao premium","Releituras autorais com técnica e textura","Localização no Balneário Shopping – acesso e fluxo"]$$::jsonb,
  $$[]$$::jsonb,
  $$[{"date":"Abril 25","title":"Dia do Nigiri","description":"Celebração natural para a marca"},{"date":"Maio 18/28","title":"Dia do Salmão e Uramaki","description":"Datas de conteúdo"},{"date":"Setembro 5","title":"Dia da Gastronomia Japonesa","description":"Data principal"},{"date":"Novembro 1","title":"Dia do Sushi","description":"Celebração do sushi"}]$$::jsonb,
  $${"personality":"Premium, preciso, sensorial","use_words":["frescor","corte preciso","premium","cortes nobres","experiência"],"avoid_words":["barato","só hoje","corre"],"taglines":["Sushi de assinatura, do clássico ao premium"]}$$::jsonb,
  $$[{"name":"Apreciador exigente","age":"30-50","profile":"Valoriza gastronomia japonesa de qualidade com cortes nobres","behaviors":"Disposto a pagar por cortes especiais e experiência única"}]$$::jsonb,
  $$[{"name":"Corte em foco","description":"Reels recorrentes com destaque para um corte ou peça e ASMR do preparo"},{"name":"Cortes premium","description":"Wagyu, atum azul, vieira – itens diferenciadores da casa"},{"name":"Variedade","description":"Da apresentação clássica à autoral"},{"name":"Datas do calendário","description":"Dia do Nigiri, Salmão, Sushi – ganchos naturais de conteúdo"}]$$::jsonb,
  $$[{"name":"Corte em foco","description":"Destaque para um corte por edição com ASMR do preparo","frequency":"Recorrente"}]$$::jsonb,
  'Close no corte, brilho do peixe, montagem. ASMR da faca. Luz controlada, fundo neutro. Estética premium contemporânea, foco na qualidade do peixe.'
FROM clients c
WHERE c.sous_chef_url LIKE '%#uni-zushi%' OR c.name ILIKE '%Uni Zushi%'
LIMIT 1
ON CONFLICT (client_id) DO NOTHING;


-- ── GrowFit Gourmet ───────────────────────────────────────────────
INSERT INTO client_manuals (
  client_id, souschef_slug, tagline, concept, history,
  pillars, colors, fonts, address, phone, hours, instagram, website, delivery_links,
  menu, differentials, promotions, events, tone_of_voice, personas, editorial_pillars,
  content_series, production_notes
)
SELECT c.id, 'growfit-gourmet',
  'Saúde e sabor, aqui você tem os dois',
  'Restaurante, café e empório com alimentação saudável gourmet: sem glúten, sem lactose, sem conservantes, com fábrica própria',
  'Suany Amorim Piffer fundou o GrowFit com a missão de provar que saudável pode ser gourmet. Fábrica própria garante segurança alimentar para celíacos e intolerantes. Quatro unidades em BC e Itapema.',
  $$[{"name":"Saúde Foco","description":"Sem glúten, sem lactose, sem conservantes, alto teor de fibras"},{"name":"Qualidade Gourmet","description":"Preparo artesanal com ingredientes nobres"},{"name":"Segurança Alimentar","description":"Fábrica própria garante controle e confiança"},{"name":"Múltiplos Formatos","description":"Restaurante, café, empório, encomendas e catálogos de evento"}]$$::jsonb,
  $$[]$$::jsonb,
  $$[]$$::jsonb,
  'BC Barra Norte: Av. Brasil, 169 · BC Shopping: Av. Santa Catarina, 1 · Itapema: Rua 301, 218',
  '(47) 99778-0025',
  $${"Barra Norte":"Todos os dias 8h-20h","Shopping":"Todos os dias 11h-23h","Itapema":"Seg-sáb 8h-20h, domingo 8h-19h"}$$::jsonb,
  '@growfitgourmet', '', $$[]$$::jsonb,
  $$[{"category":"Café da Manhã","items":[{"name":"Grow Basic","price":"R$ 21,90","description":"Pão de grãos, ovo frito em óleo de coco, café puro"},{"name":"Prato Grow Proteico","price":"R$ 43,90","description":"Pão de grãos, queijo, ovos, abacate, banana grelhada"},{"name":"Brunch dos Sonhos","price":"R$ 72,90","description":"Café, suco, pão, ovo, panquecas, frutas"}]},{"category":"Sanduíches","items":[{"name":"Hambúrguer de Frango","price":"R$ 49,90","description":"Frango crocante, muçarela de búfala, barbecue, pão de grãos"},{"name":"Atum Natural","price":"R$ 37,90","description":"Atum natural, mayo de abacate, pesto"}]},{"category":"À la carte","items":[{"name":"Salmão Grelhado ao Maracujá","price":"R$ 74,90","description":"Purê de aipim, brócolis frescos, farofa de amêndoas"},{"name":"Tilápia Grelhada","price":"R$ 64,90","description":"Crosta de sementes, arroz integral, feijão vermelho"}]}]$$::jsonb,
  $$["100% seguro para celíacos – fábrica própria","Restaurante, café e empório em um só lugar","Opções para cada dieta: sem açúcar, low carb, vegano, proteico","Catálogos de evento: cestas, salgados, coquetel, ceias","Quatro pontos de venda convenientes"]$$::jsonb,
  $$[{"title":"Catálogos de Evento","description":"Cestas, salgados, coquetel, tortas e ceias sob encomenda"},{"title":"Congelados","description":"Refeições congeladas para delivery e consumo em casa"}]$$::jsonb,
  $$[{"date":"Abril 7","title":"Dia Mundial da Saúde","description":"Data central da marca"},{"date":"Agosto 31","title":"Dia da Nutricionista","description":"Conexão com público e parceiros"},{"date":"Dezembro","title":"Catálogos Natal e Réveillon","description":"Menus e cestas saudáveis para datas especiais"}]$$::jsonb,
  $${"personality":"Acolhedor, leve, sem culpa","use_words":["comida de verdade","sem culpa","leve","saúde e sabor","artesanal"],"avoid_words":["dieta restritiva","proibido","sacrifício"],"taglines":["Saúde e sabor, aqui você tem os dois"]}$$::jsonb,
  $$[{"name":"Consumidor saúde","age":"30-50","profile":"Busca alimentação saudável no dia a dia","behaviors":"Valoriza bem-estar e aprecia conveniência"},{"name":"Celíaco/Intolerante","age":"Variado","profile":"Necessita de segurança alimentar garantida","behaviors":"Busca fornecedores confiáveis e seguros"}]$$::jsonb,
  $$[{"name":"Comida de verdade","description":"Ingredientes, processos artesanais, bastidores da fábrica própria"},{"name":"Saúde sem culpa","description":"Conteúdo leve, educativo, sabor em primeiro plano"},{"name":"Segurança alimentar","description":"Comunicação direta para celíacos – confiança como diferencial"},{"name":"Empório e encomendas","description":"Congelados, cestas, catálogos de evento e serviços"}]$$::jsonb,
  $$[{"name":"Prato Saudável do Dia","description":"Item do cardápio com foco em sabor e ingredientes","frequency":"Recorrente"}]$$::jsonb,
  'Luz natural fresca, pratos coloridos com brotos e flores comestíveis. Mesa clara. Bastidores das lojas e cozinha. Humanizar a operação. Fábrica própria como prova de cuidado.'
FROM clients c
WHERE c.sous_chef_url LIKE '%#growfit-gourmet%' OR c.name ILIKE '%GrowFit%'
LIMIT 1
ON CONFLICT (client_id) DO NOTHING;


-- ── Big Poke ──────────────────────────────────────────────────────
INSERT INTO client_manuals (
  client_id, souschef_slug, tagline, concept, history,
  pillars, colors, fonts, address, phone, hours, instagram, website, delivery_links,
  menu, differentials, promotions, events, tone_of_voice, personas, editorial_pillars,
  content_series, production_notes
)
SELECT c.id, 'big-poke',
  'O maior poke da cidade',
  'Poke bowls havaianos generosos e personalizáveis, focados em delivery e estilo de vida saudável',
  'Fundado por Tiago Maier, marca em crescimento estudando expansão para ponto físico em BC. Parcerias com influenciadores e eventos fitness.',
  $$[{"name":"Generosidade","description":"Porções de 300-450g – os maiores da cidade"},{"name":"Personalização","description":"Cliente monta o próprio bowl: base, proteína, toppings"},{"name":"Delivery Noturno","description":"Atendimento até 01h30 – opção fresca para a madrugada"},{"name":"Estilo Ativo","description":"Conexão com público fitness e bem-estar"}]$$::jsonb,
  $$[]$$::jsonb,
  $$[]$$::jsonb,
  'Rua Áustria, 145 · Nações · Balneário Camboriú · SC · 88338-030',
  '(47) 99697-2807',
  $${"segunda-sábado":"11h-14h30, 18h-01h30","domingo":"18h-01h30"}$$::jsonb,
  '@bigpokesc', 'app.anota.ai', $$["Anota.ai"]$$::jsonb,
  $$[{"category":"Poke Montável","items":[{"name":"Bowl personalizado","price":"Consultar plataforma","description":"300-450g: escolha base, proteína, toppings e molho"}]}]$$::jsonb,
  $$["Porções de 300-450g – os maiores pokes da cidade","Personalização total: cliente monta o bowl do jeito que quer","Delivery até 01h30 – refeição fresca de madrugada","Posicionamento fitness e wellness","Parcerias com influenciadores e eventos","Marca em expansão para ponto físico"]$$::jsonb,
  $$[]$$::jsonb,
  $$[{"date":"Dezembro-Março","title":"Alta temporada","description":"Poke combina com calor e praia"},{"date":"Recorrente","title":"Eventos fitness","description":"Academias, corridas e eventos de bem-estar"}]$$::jsonb,
  $${"personality":"Jovem, vibrante, descomplicado","use_words":["farto","do seu jeito","fresco","colorido","leveza"],"avoid_words":["pesado","formal demais","complicado"],"taglines":["O maior poke da cidade"]}$$::jsonb,
  $$[{"name":"Público feminino fitness","age":"25-40","profile":"Vida saudável, estética e fitness","behaviors":"Busca refeição prática, leve e saborosa para delivery"}]$$::jsonb,
  $$[{"name":"Unboxing do bowl","description":"Embalagem chegando, bowl abrindo, tamanho e frescor revelados"},{"name":"Montagem colorida","description":"Composição do poke, cores dos toppings, variedade visual"},{"name":"Praticidade","description":"Janta sem cozinhar, leve, rápida e saudável"},{"name":"Vida ativa","description":"Conexão com fitness, parcerias, eventos de bem-estar"}]$$::jsonb,
  $$[{"name":"Monta seu poke","description":"Sugestões recorrentes de combinações e favoritos do bowl","frequency":"Recorrente"}]$$::jsonb,
  'Embalagem chegando, bowl abrindo grande. Ingredientes coloridos, praia e luz natural. Energia vibrante. Clima havaiano, tom descontraído.'
FROM clients c
WHERE c.sous_chef_url LIKE '%#big-poke%' OR c.name ILIKE '%Big Poke%'
LIMIT 1
ON CONFLICT (client_id) DO NOTHING;


-- ── D''Mori Gastronomia ────────────────────────────────────────────
INSERT INTO client_manuals (
  client_id, souschef_slug, tagline, concept, history,
  pillars, colors, fonts, address, phone, hours, instagram, website, delivery_links,
  menu, differentials, promotions, events, tone_of_voice, personas, editorial_pillars,
  content_series, production_notes
)
SELECT c.id, 'dmori-gastronomia',
  'Cozinha autoral',
  'Culinária autoral com pratos assinatura e identidade própria em Videira, SC',
  'Cliente novo da Bagano, manual em estruturação. Cozinha autoral em Videira com construção de posicionamento desde o início.',
  $$[{"name":"Assinatura autoral","description":"Pratos com identidade própria e técnica"}]$$::jsonb,
  $$[]$$::jsonb,
  $$[]$$::jsonb,
  'Rua Padre Anchieta, 168 · Centro · Videira · SC · 89560-190',
  '(49) 98805-3203',
  $${"segunda-terça":"11h30-14h","quarta-sábado":"11h30-14h, 17h30-23h","domingo":"Fechado"}$$::jsonb,
  '@dmori.gastronomia', '', $$[]$$::jsonb,
  $$[]$$::jsonb,
  $$["Cozinha autoral com pratos assinatura","Identidade de marca em construção","Posicionamento sendo definido do zero"]$$::jsonb,
  $$[]$$::jsonb,
  $$[]$$::jsonb,
  $${"personality":"A definir com o cliente","use_words":["autoral","assinatura","identidade"],"avoid_words":[],"taglines":["Cozinha autoral"]}$$::jsonb,
  $$[]$$::jsonb,
  $$[{"name":"Assinatura autoral","description":"Pratos assinatura que tornam a cozinha única"},{"name":"Bastidores","description":"Preparo, cuidado, as mãos por trás dos pratos"},{"name":"Apresentação da marca","description":"Conta nova, apresentação e posicionamento são prioridade"}]$$::jsonb,
  $$[{"name":"Prato autoral em foco","description":"Prato assinatura com história por trás","frequency":"Recorrente"}]$$::jsonb,
  'Foco no prato, montagem, texturas e emprimento autoral. Estética visual a definir com cliente. Apresentação e posicionamento como prioridade.'
FROM clients c
WHERE c.sous_chef_url LIKE '%#dmori-gastronomia%' OR c.name ILIKE '%Mori%Gastro%'
LIMIT 1
ON CONFLICT (client_id) DO NOTHING;


-- ── Mundo Selvagem Garden ─────────────────────────────────────────
INSERT INTO client_manuals (
  client_id, souschef_slug, tagline, concept, history,
  pillars, colors, fonts, address, phone, hours, instagram, website, delivery_links,
  menu, differentials, promotions, events, tone_of_voice, personas, editorial_pillars,
  content_series, production_notes
)
SELECT c.id, 'mundo-selvagem-garden',
  'Um paraíso escondido na Praia dos Amores',
  'Restaurante jardim ao ar livre com atmosfera mística e imersiva, drinques autorais e experiência de descoberta',
  'Jardim gastronômico ao ar livre na Praia dos Amores, BC. Ambiente místico com verde exuberante, experiência de descoberta e coquetelaria autoral. Compartilha espaço com o Mundo Selvagem Pizza.',
  $$[{"name":"Jardim ao ar livre","description":"Principal diferencial – ambiente único em BC"},{"name":"Drinks autorais","description":"Coquetelaria assinatura em cenário mágico"},{"name":"Experiência escondida","description":"Sensação de descoberta de um lugar secreto"},{"name":"Gastronomia","description":"Frutos do mar, carnes e opções vegetarianas"}]$$::jsonb,
  $$[]$$::jsonb,
  $$[]$$::jsonb,
  'Avenida Ruy Barbosa, 207F · Fundos · Praia dos Amores · Balneário Camboriú · SC · 88331-510',
  '(47) 3360-0500',
  $${"quarta-sexta":"18h30-23h30","sábado":"12h-16h, 19h-23h30","domingo":"12h-16h, 18h30-23h","segunda-terça":"Fechado"}$$::jsonb,
  '@mundoselvagemgarden', 'mundoselvagem.com.br', $$[]$$::jsonb,
  $$[{"category":"Gastronomia","items":[{"name":"Frutos do mar, carnes e vegetariano","price":"Consultar","description":"Carta ampla para público diverso"}]},{"category":"Bar","items":[{"name":"Drinques autorais","price":"Consultar","description":"Coquetelaria autoral em ambiente místico"}]}]$$::jsonb,
  $$["Jardim ao ar livre – principal diferencial","Drinks autorais com coquetelaria assinatura","Experiência de descoberta – sensação de lugar secreto","Compartilha espaço com o Mundo Selvagem Pizza"]$$::jsonb,
  $$[]$$::jsonb,
  $$[{"date":"Verão","title":"Alta temporada","description":"O jardim brilha nas noites quentes"},{"date":"Junho 12","title":"Dia dos Namorados","description":"Ambiente convidativo para casais"}]$$::jsonb,
  $${"personality":"Mágico, sensorial, convidativo","use_words":["jardim","escondido","descobrir","mágico","experiência"],"avoid_words":["comum","só hoje","corre"],"taglines":["Um paraíso escondido na Praia dos Amores"]}$$::jsonb,
  $$[{"name":"Casal experiencial","age":"25-50","profile":"Busca experiências diferentes e instagramáveis","behaviors":"Casais em noite especial, gastronomia com cenário único"}]$$::jsonb,
  $$[{"name":"Descoberta","description":"O caminho da entrada, o jardim se revelando ao fundo"},{"name":"Atmosfera noturna","description":"Iluminação do jardim à noite, verde, paz"},{"name":"Drinks e pratos","description":"Coquetelaria e gastronomia com cenário selvagem"},{"name":"Experiência a dois","description":"Casais em momentos especiais"}]$$::jsonb,
  $$[{"name":"Noites no Jardim","description":"Capturando a atmosfera do Garden à noite","frequency":"Recorrente"}]$$::jsonb,
  'Iluminação do jardim, verde exuberante, drinks brilhando. Estética mágica e natural. Místico e imersivo. Paraíso escondido. Luz baixa, ambiente noturno.'
FROM clients c
WHERE c.sous_chef_url LIKE '%#mundo-selvagem-garden%' OR c.name ILIKE '%Selvagem%Garden%'
LIMIT 1
ON CONFLICT (client_id) DO NOTHING;


-- ── Mundo Selvagem Pizza ──────────────────────────────────────────
INSERT INTO client_manuals (
  client_id, souschef_slug, tagline, concept, history,
  pillars, colors, fonts, address, phone, hours, instagram, website, delivery_links,
  menu, differentials, promotions, events, tone_of_voice, personas, editorial_pillars,
  content_series, production_notes
)
SELECT c.id, 'mundo-selvagem-pizza',
  'Pizzas de alma italiana e coração selvagem',
  'Pizzas de fermentação natural, forno a lenha, longa fermentação, ingredientes premium e opções inclusivas',
  'Pizzaria de forno a lenha na Praia dos Amores, BC. Longa fermentação, massa vegana e integral disponíveis. Compartilha espaço com o Mundo Selvagem Garden.',
  $$[{"name":"Forno a lenha","description":"Pizza com borda aerada e crocante"},{"name":"Longa fermentação","description":"Massa leve, fácil digestão"},{"name":"Inclusividade","description":"Massas vegana, integral e sem glúten"},{"name":"Selvagem","description":"Identidade rústica e com personalidade"}]$$::jsonb,
  $$[]$$::jsonb,
  $$[]$$::jsonb,
  'Avenida Ruy Barbosa, 207H · Praia dos Amores · Balneário Camboriú · SC · 88331-510',
  '',
  $${"quarta-sábado":"18h30-23h30","domingo":"18h30-22h30","segunda-terça":"Fechado"}$$::jsonb,
  '@mundoselvagempizza', 'mundoselvagem.com.br', $$[]$$::jsonb,
  $$[{"category":"Pizzas Forno a Lenha","items":[{"name":"Pizzas de longa fermentação","price":"Consultar","description":"Sabores clássicos e exclusivos com ingredientes premium"}]}]$$::jsonb,
  $$["Forno a lenha – borda aerada e crocante","Longa fermentação – massa leve e digestiva","Massas inclusivas: vegana, integral","Compartilha espaço com o Mundo Selvagem Garden"]$$::jsonb,
  $$[]$$::jsonb,
  $$[{"date":"Julho 10","title":"Dia da Pizza","description":"Data principal da marca"},{"date":"Verão","title":"Alta temporada","description":"Pico de público na Praia dos Amores"}]$$::jsonb,
  $${"personality":"Rústico, acolhedor, com personalidade selvagem","use_words":["forno a lenha","artesanal","longa fermentação","selvagem","acolhedor"],"avoid_words":["industrial","só hoje","genérico"],"taglines":["Pizzas de alma italiana e coração selvagem"]}$$::jsonb,
  $$[{"name":"Público da Praia dos Amores","age":"Variado","profile":"Valoriza pizza artesanal em ambiente rústico","behaviors":"Restrições alimentares e busca por qualidade"}]$$::jsonb,
  $$[{"name":"Ritual do forno","description":"Pizza saindo do forno, som da lenha, fumaça, borda"},{"name":"Foodporn","description":"Corte da fatia, queijo, massa aerada"},{"name":"Inclusão","description":"Massas vegana e integral para quem tem restrições"},{"name":"Ambiente","description":"Clima rústico da Praia dos Amores, conexão com o Garden"}]$$::jsonb,
  $$[{"name":"Sabor da vez","description":"Apresentação recorrente de pizza com destaque nos ingredientes","frequency":"Recorrente"}]$$::jsonb,
  'Forno a lenha, massa sendo aberta, corte, borda. Queijo derretendo. ASMR da crocância. Luz baixa, madeira e fogo. Aconchego, rústico, quente.'
FROM clients c
WHERE c.sous_chef_url LIKE '%#mundo-selvagem-pizza%' OR c.name ILIKE '%Selvagem%Pizza%'
LIMIT 1
ON CONFLICT (client_id) DO NOTHING;


-- ── Toit BC ───────────────────────────────────────────────────────
INSERT INTO client_manuals (
  client_id, souschef_slug, tagline, concept, history,
  pillars, colors, fonts, address, phone, hours, instagram, website, delivery_links,
  menu, differentials, promotions, events, tone_of_voice, personas, editorial_pillars,
  content_series, production_notes
)
SELECT c.id, 'toit-bc',
  'Rooftop com coquetelaria autoral',
  'Restaurante rooftop em Balneário Camboriú com coquetelaria autoral e happy hour',
  'Cliente Bagano em estruturação. Rooftop com localização privilegiada em BC, coquetelaria autoral e happy hour.',
  $$[{"name":"Rooftop","description":"Localização privilegiada com vista"},{"name":"Coquetelaria","description":"Drinks autorais assinatura"},{"name":"Happy Hour","description":"Experiência de início de noite"}]$$::jsonb,
  $$[]$$::jsonb,
  $$[]$$::jsonb,
  'Avenida Atlântica, 3640 · Centro · Balneário Camboriú · SC · 88330-024',
  '(47) 98820-9284',
  $${"todos os dias":"11h-23h"}$$::jsonb,
  '@toitbc', '', $$[]$$::jsonb,
  $$[]$$::jsonb,
  $$["Rooftop com localização privilegiada","Coquetelaria autoral","Happy hour com pratos e drinks"]$$::jsonb,
  $$[]$$::jsonb, $$[]$$::jsonb,
  $${"personality":"A definir com o cliente","use_words":[],"avoid_words":[],"taglines":[]}$$::jsonb,
  $$[]$$::jsonb, $$[]$$::jsonb, $$[]$$::jsonb,
  'Manual em construção. Coletar: conceito, história, equipe, cardápio detalhado, tom de voz, séries fixas.'
FROM clients c
WHERE c.sous_chef_url LIKE '%#toit-bc%' OR c.name ILIKE '%Toit%'
LIMIT 1
ON CONFLICT (client_id) DO NOTHING;


-- ── Alexandria Burger ─────────────────────────────────────────────
INSERT INTO client_manuals (
  client_id, souschef_slug, tagline, concept, history,
  pillars, colors, fonts, address, phone, hours, instagram, website, delivery_links,
  menu, differentials, promotions, events, tone_of_voice, personas, editorial_pillars,
  content_series, production_notes
)
SELECT c.id, 'alexandria-burger',
  'Hamburgueria com identidade',
  'Hamburgueria em modelo franquia',
  'Cliente Bagano em estruturação. Hamburgueria com modelo de franquia, dados em consolidação.',
  $$[]$$::jsonb, $$[]$$::jsonb, $$[]$$::jsonb,
  '', '', $${}$$::jsonb,
  '@alexandriaburgerfranquia', '', $$[]$$::jsonb,
  $$[]$$::jsonb, $$[]$$::jsonb, $$[]$$::jsonb, $$[]$$::jsonb,
  $${"personality":"A definir com o cliente","use_words":[],"avoid_words":[],"taglines":[]}$$::jsonb,
  $$[]$$::jsonb, $$[]$$::jsonb, $$[]$$::jsonb,
  'Manual em construção. Consolidar: história, equipe, cardápio, tom de voz, direcionamentos.'
FROM clients c
WHERE c.sous_chef_url LIKE '%#alexandria-burger%' OR c.name ILIKE '%Alexandria%Burger%'
LIMIT 1
ON CONFLICT (client_id) DO NOTHING;


-- ── Urban Salad ───────────────────────────────────────────────────
INSERT INTO client_manuals (
  client_id, souschef_slug, tagline, concept, history,
  pillars, colors, fonts, address, phone, hours, instagram, website, delivery_links,
  menu, differentials, promotions, events, tone_of_voice, personas, editorial_pillars,
  content_series, production_notes
)
SELECT c.id, 'urban-salad',
  'Alimentação saudável feita para a vida real',
  'Saladaria com bowls, saladas e sanduíches naturais – alimentação saudável prática para o dia a dia',
  'Saladaria em Praia Brava (Itajaí) e Chapecó. Comida saudável prática e saborosa para o cotidiano.',
  $$[{"name":"Leveza","description":"Refeição saudável para o dia a dia"},{"name":"Frescor","description":"Ingredientes de qualidade diariamente"},{"name":"Personalização","description":"Bowls montados conforme o gosto"},{"name":"Conveniência","description":"Duas unidades bem localizadas"}]$$::jsonb,
  $$[]$$::jsonb,
  $$[]$$::jsonb,
  'Praia Brava: Rua Doca Rebelo, 161 · Itajaí · Chapecó: Av. Porto Alegre, 380D',
  '(47) 99788-6625',
  $${"Praia Brava seg-sex":"11h30-20h30","Praia Brava sábado":"11h30-15h","Chapecó seg-sex":"11h30-20h","Chapecó sábado":"11h-14h","domingo":"Fechado"}$$::jsonb,
  '@urbansalad_praiabrava', '', $$[]$$::jsonb,
  $$[{"category":"Saladas & Bowls","items":[{"name":"Saladas e bowls frescos","price":"Consultar","description":"Montáveis, coloridos e equilibrados"}]},{"category":"Sanduíches","items":[{"name":"Sanduíches naturais","price":"Consultar","description":"Opção leve e prática"}]}]$$::jsonb,
  $$["Leveza para o dia a dia – refeição rápida e saudável","Personalização total dos bowls","Duas unidades: Praia Brava e Chapecó"]$$::jsonb,
  $$[]$$::jsonb, $$[]$$::jsonb,
  $${"personality":"Leve, prático, acessível","use_words":["saudável","fresco","leve","prático","bem-estar"],"avoid_words":[],"taglines":["Alimentação saudável feita para a vida real"]}$$::jsonb,
  $$[{"name":"Público saudável","age":"25-50","profile":"Vida ativa, busca refeição leve","behaviors":"Almoço do dia a dia, bem-estar"}]$$::jsonb,
  $$[{"name":"Leveza","description":"Refeição saudável como parte da rotina"},{"name":"Frescor","description":"Ingredientes de qualidade visíveis"},{"name":"Personalização","description":"Bowls montados do seu jeito"},{"name":"Conveniência","description":"Duas unidades de fácil acesso"}]$$::jsonb,
  $$[]$$::jsonb,
  'Pratos coloridos com brotos e flores. Luz natural. Fresco e convidativo. Confirmar horários no Google para cada unidade.'
FROM clients c
WHERE c.sous_chef_url LIKE '%#urban-salad%' OR c.name ILIKE '%Urban Salad%'
LIMIT 1
ON CONFLICT (client_id) DO NOTHING;


-- ── Natuflor Açaí ─────────────────────────────────────────────────
INSERT INTO client_manuals (
  client_id, souschef_slug, tagline, concept, history,
  pillars, colors, fonts, address, phone, hours, instagram, website, delivery_links,
  menu, differentials, promotions, events, tone_of_voice, personas, editorial_pillars,
  content_series, production_notes
)
SELECT c.id, 'natuflor-acai',
  'Açaí natural e funcional',
  'Açaíteria com foco em ingredientes naturais e funcionais',
  'Cliente Bagano. Manual em construção – dados a coletar com o cliente.',
  $$[]$$::jsonb, $$[]$$::jsonb, $$[]$$::jsonb,
  '', '',  $${}$$::jsonb,
  '@natuflor_acai', '', $$[]$$::jsonb,
  $$[]$$::jsonb, $$[]$$::jsonb, $$[]$$::jsonb, $$[]$$::jsonb,
  $${"personality":"A definir","use_words":[],"avoid_words":[],"taglines":["Açaí natural e funcional"]}$$::jsonb,
  $$[]$$::jsonb, $$[]$$::jsonb, $$[]$$::jsonb,
  'Manual em construção. Coletar informações com o cliente.'
FROM clients c
WHERE c.sous_chef_url LIKE '%#natuflor-acai%' OR c.name ILIKE '%Natuflor%'
LIMIT 1
ON CONFLICT (client_id) DO NOTHING;


-- ── Terras Altas ──────────────────────────────────────────────────
INSERT INTO client_manuals (
  client_id, souschef_slug, tagline, concept, history,
  pillars, colors, fonts, address, phone, hours, instagram, website, delivery_links,
  menu, differentials, promotions, events, tone_of_voice, personas, editorial_pillars,
  content_series, production_notes
)
SELECT c.id, 'terras-altas',
  'Gastronomia da serra',
  'Gastronomia celebrando os ingredientes regionais e tradições culinárias da região serrana',
  'Cliente Bagano. Manual em construção – dados a coletar com o cliente.',
  $$[]$$::jsonb, $$[]$$::jsonb, $$[]$$::jsonb,
  '', '', $${}$$::jsonb,
  '@terrasaltasgastronomia', '', $$[]$$::jsonb,
  $$[]$$::jsonb, $$[]$$::jsonb, $$[]$$::jsonb, $$[]$$::jsonb,
  $${"personality":"A definir","use_words":[],"avoid_words":[],"taglines":["Gastronomia da serra"]}$$::jsonb,
  $$[]$$::jsonb, $$[]$$::jsonb, $$[]$$::jsonb,
  'Manual em construção. Coletar informações com o cliente.'
FROM clients c
WHERE c.sous_chef_url LIKE '%#terras-altas%' OR c.name ILIKE '%Terras Altas%'
LIMIT 1
ON CONFLICT (client_id) DO NOTHING;


-- ── Dom Leonello ──────────────────────────────────────────────────
INSERT INTO client_manuals (
  client_id, souschef_slug, tagline, concept, history,
  pillars, colors, fonts, address, phone, hours, instagram, website, delivery_links,
  menu, differentials, promotions, events, tone_of_voice, personas, editorial_pillars,
  content_series, production_notes
)
SELECT c.id, 'dom-leonello',
  'O sabor da terra que encontra o mar',
  'Gastronomia da serra que dialoga com influências do litoral, em Videira SC',
  'Cliente Bagano em Videira, SC. Manual em construção – dados a coletar com o cliente.',
  $$[]$$::jsonb, $$[]$$::jsonb, $$[]$$::jsonb,
  'Videira, SC', '', $${}$$::jsonb,
  '@leonellodom', '', $$[]$$::jsonb,
  $$[]$$::jsonb,
  $$["Localização em Videira","Gastronomia da serra"]$$::jsonb,
  $$[]$$::jsonb, $$[]$$::jsonb,
  $${"personality":"A definir","use_words":[],"avoid_words":[],"taglines":["O sabor da terra que encontra o mar"]}$$::jsonb,
  $$[]$$::jsonb, $$[]$$::jsonb, $$[]$$::jsonb,
  'Manual em construção. Coletar história, equipe, cardápio e tom de voz com o cliente.'
FROM clients c
WHERE c.sous_chef_url LIKE '%#dom-leonello%' OR c.name ILIKE '%Dom Leonello%' OR c.name ILIKE '%Leonello%'
LIMIT 1
ON CONFLICT (client_id) DO NOTHING;


-- ── Gruh Lancheria ────────────────────────────────────────────────
INSERT INTO client_manuals (
  client_id, souschef_slug, tagline, concept, history,
  pillars, colors, fonts, address, phone, hours, instagram, website, delivery_links,
  menu, differentials, promotions, events, tone_of_voice, personas, editorial_pillars,
  content_series, production_notes
)
SELECT c.id, 'gruh-lancheria',
  'Lancheria contemporânea',
  'Lancheria com conceito contemporâneo',
  'Cliente Bagano. Manual em construção – dados a coletar com o cliente.',
  $$[]$$::jsonb, $$[]$$::jsonb, $$[]$$::jsonb,
  '', '', $${}$$::jsonb,
  '@gruhlancheria', '', $$[]$$::jsonb,
  $$[]$$::jsonb, $$[]$$::jsonb, $$[]$$::jsonb, $$[]$$::jsonb,
  $${"personality":"A definir","use_words":[],"avoid_words":[],"taglines":[]}$$::jsonb,
  $$[]$$::jsonb, $$[]$$::jsonb, $$[]$$::jsonb,
  'Manual em construção. Coletar informações com o cliente.'
FROM clients c
WHERE c.sous_chef_url LIKE '%#gruh-lancheria%' OR c.name ILIKE '%Gruh%'
LIMIT 1
ON CONFLICT (client_id) DO NOTHING;


-- ┌─────────────────────────────────────────────────────────────────┐
-- │  3. VERIFICAÇÃO                                                  │
-- └─────────────────────────────────────────────────────────────────┘
SELECT c.name, m.souschef_slug, m.tagline
FROM client_manuals m
JOIN clients c ON c.id = m.client_id
ORDER BY c.name;
