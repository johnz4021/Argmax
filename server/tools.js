// Claude tool schemas for AlgoTutor

export const tools = [
  {
    name: 'create_graph',
    description:
      'Create and display a graph for the lesson. Call this first to set up the visualization before running the algorithm.',
    input_schema: {
      type: 'object',
      properties: {
        nodes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              label: { type: 'string' },
            },
            required: ['id', 'label'],
          },
          description: 'Graph nodes',
        },
        edges: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              source: { type: 'string' },
              target: { type: 'string' },
              weight: { type: 'number' },
            },
            required: ['source', 'target'],
          },
          description: 'Graph edges',
        },
        positions: {
          type: 'object',
          description: 'Node positions as { nodeId: { x, y } }',
        },
      },
      required: ['nodes', 'edges'],
    },
  },
  {
    name: 'run_algorithm',
    description:
      'Execute an algorithm on the current graph and get the full execution trace. Use this to get the actual step-by-step trace before narrating.',
    input_schema: {
      type: 'object',
      properties: {
        algorithm: {
          type: 'string',
          enum: ['dijkstra', 'bfs', 'dfs'],
          description: 'Algorithm to run',
        },
        source: {
          type: 'string',
          description: 'Source node ID',
        },
      },
      required: ['algorithm', 'source'],
    },
  },
  {
    name: 'emit_segment',
    description:
      'Emit a teaching segment with narration text and optional visualization actions. Each segment is atomic — it will be fully played (TTS + animation) before the next segment starts. Use this to narrate each step of the algorithm.',
    input_schema: {
      type: 'object',
      properties: {
        narration: {
          type: 'string',
          description:
            'The narration text to speak aloud. Should be conversational and educational.',
        },
        viz_actions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: [
                  'highlight_node',
                  'highlight_edge',
                  'mark_visited',
                  'mark_current',
                  'set_label',
                  'reset_highlights',
                  'show_path',
                  'update_table',
                ],
              },
              node: { type: 'string' },
              from: { type: 'string' },
              to: { type: 'string' },
              label: { type: 'string' },
              path: { type: 'array', items: { type: 'string' } },
              table: {
                type: 'object',
                description: 'Distance table as { nodeId: distance }',
              },
              className: { type: 'string' },
            },
            required: ['action'],
          },
          description: 'Visualization actions to perform with this segment',
        },
        phase: {
          type: 'string',
          description:
            'Current phase label (e.g., "Initialization", "Processing Node A", "Results")',
        },
        delay_ms: {
          type: 'number',
          description:
            'Additional delay in ms after TTS finishes (default 500). Use longer delays for complex visualizations.',
        },
      },
      required: ['narration'],
    },
  },
  {
    name: 'respond_to_interrupt',
    description:
      'Respond to a learner question that interrupted the lesson. After answering, continue teaching from where you left off.',
    input_schema: {
      type: 'object',
      properties: {
        answer: {
          type: 'string',
          description: 'Answer to the learner question',
        },
        viz_actions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string' },
              node: { type: 'string' },
              from: { type: 'string' },
              to: { type: 'string' },
              label: { type: 'string' },
              path: { type: 'array', items: { type: 'string' } },
              table: { type: 'object' },
              className: { type: 'string' },
            },
            required: ['action'],
          },
        },
      },
      required: ['answer'],
    },
  },
];
