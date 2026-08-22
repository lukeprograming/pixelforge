# Decisions

- A miniatura usa `updated_at` na URL e o backend também envia `no-store`.
- A lista `/meta` usa timestamp no frontend, `cache: no-store` e cabeçalho
  `Cache-Control: no-store` no backend.
- O estado de salvamento fica na barra superior, imediatamente após Salvar.
- Salvamento manual é o padrão; autosave permanece disponível, desligado por
  padrão, e alterações pendentes acionam o aviso nativo `beforeunload`.
- O gerador de armadura não será alterado nesta rodada.
- A anomalia dos pés foi rastreada a uma cópia globalmente espelhada da área
  da cabeça dentro da região de origem das pernas no próprio template.
