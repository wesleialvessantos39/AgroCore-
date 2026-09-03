-- AgroCore — OE-007.006 R4 — lookup reverso por referência estável.
-- Permite que consumidores futuros localizem as visitas ligadas a uma
-- proposta ou projeção operacional sem varrer todo o domínio.

create index if not exists technical_visit_integration_links_stable_reference_idx
  on public.technical_visit_integration_links (
    organization_id,
    target_domain,
    stable_reference,
    status
  );

comment on index public.technical_visit_integration_links_stable_reference_idx is
  'OE-007.006 R4: lookup reverso de integrações por referência estável e organização.';
