// Claude tool schemas for AlgoTutor

import { ALGORITHMS } from './algorithms/registry.js';

const algorithmEnum = Object.keys(ALGORITHMS);

export const tools = [
  {
    name: 'create_graph',
    description:
      'Create and display a graph for the lesson. Call this first to set up the visualization for graph algorithms.',
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
    name: 'create_visualization',
    description:
      'Set up the visualization panel(s) for the current lesson. Call this INSTEAD of create_graph for non-graph algorithms (sorting, DP, trees, etc.). For graph algorithms, use create_graph instead.',
    input_schema: {
      type: 'object',
      properties: {
        panels: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              renderer: {
                type: 'string',
                enum: ['graph', 'array', 'table', 'tree', 'linked'],
              },
              config: {
                type: 'object',
                description: 'Renderer-specific initial config',
              },
            },
            required: ['renderer'],
          },
          description:
            'Visualization panels to display. Usually one, but some algorithms need two (e.g., heapsort needs array + tree).',
        },
        context_panels: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Unique panel ID (e.g., "distances", "pq")' },
              type: {
                type: 'string',
                enum: ['key_value', 'collection', 'expression', 'log', 'pseudocode'],
                description: 'Panel display type',
              },
              title: { type: 'string', description: 'Display title (e.g., "Distances", "Priority Queue")' },
              initial_data: { type: 'object', description: 'Initial data for the panel (optional)' },
            },
            required: ['id', 'type', 'title'],
          },
          description: 'Supplementary context panels to show alongside the main visualization. Use these for metadata like distance tables, queue contents, pseudocode, etc.',
        },
      },
      required: ['panels'],
    },
  },
  {
    name: 'run_algorithm',
    description:
      'Execute an algorithm and get the full execution trace. Use this to get the actual step-by-step trace before narrating. For graph algorithms, also pass source. For sorting, optionally pass a custom array. For search, pass array and target.',
    input_schema: {
      type: 'object',
      properties: {
        algorithm: {
          type: 'string',
          enum: algorithmEnum,
          description: 'Algorithm to execute',
        },
        source: {
          type: 'string',
          description: 'Source node ID (for graph algorithms)',
        },
        input: {
          type: 'object',
          description:
            'Algorithm-specific input. For sorting: { array: [5,3,8,1] }. For search: { array: [...], target: 23 }. Omit to use default sample data.',
        },
      },
      required: ['algorithm'],
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
              renderer: {
                type: 'string',
                enum: ['graph', 'array', 'table', 'tree', 'linked', 'context'],
                description: 'Which renderer to target. REQUIRED for all viz actions.',
              },
              action: {
                type: 'string',
                description: 'Renderer-specific action name',
              },
              params: {
                type: 'object',
                description: 'Action parameters (renderer-specific)',
              },
              // Legacy graph fields (backward compat)
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
            required: ['renderer', 'action'],
          },
          description:
            'Visualization actions to perform with this segment. Use { renderer, action, params } format for non-graph renderers.',
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
      'Respond to a learner question using visual explanation. Pick the right mode based on the question type:\n- "overlay": for "why?" questions — dims irrelevant elements, spotlights relevant ones, adds annotations\n- "rewind": for "what just happened?" — replays recent steps more slowly\n- "ghost_alternative": for "what if?" — shows alternative paths as ghost overlays\nAfter the explanation, continue teaching from where you left off.',
    input_schema: {
      type: 'object',
      properties: {
        answer: {
          type: 'string',
          description: 'Spoken answer to the learner',
        },
        explanation_mode: {
          type: 'string',
          enum: ['overlay', 'rewind', 'ghost_alternative', 'none'],
          description: 'Visual explanation mode. Use "none" for simple verbal answers.',
        },
        overlay: {
          type: 'object',
          description: 'Config for overlay mode. Required when explanation_mode is "overlay".',
          properties: {
            spotlight_nodes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Node IDs to spotlight (graph + tree renderers)',
            },
            spotlight_edges: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  from: { type: 'string' },
                  to: { type: 'string' },
                },
                required: ['from', 'to'],
              },
              description: 'Edges to spotlight (graph + tree renderers)',
            },
            spotlight_indices: {
              type: 'array',
              items: { type: 'number' },
              description: '0-based indices to spotlight (array + linked renderers)',
            },
            spotlight_cells: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  row: { type: 'number' },
                  col: { type: 'number' },
                },
                required: ['row', 'col'],
              },
              description: 'Cells to spotlight (table renderer)',
            },
            annotations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  target: { type: 'string', description: 'Node ID, index number, or "row-col" string to anchor to' },
                  text: { type: 'string' },
                  position: {
                    type: 'string',
                    enum: ['top', 'bottom', 'left', 'right'],
                    description: 'Relative to target',
                  },
                },
                required: ['target', 'text'],
              },
            },
          },
        },
        rewind: {
          type: 'object',
          description: 'Config for rewind mode. Required when explanation_mode is "rewind".',
          properties: {
            steps_back: { type: 'number', description: 'How many segments to rewind (1-5)' },
            narration_per_step: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Re-narration text for each replayed step, using different/clearer wording',
            },
          },
        },
        ghost_alternative: {
          type: 'object',
          description:
            'Config for ghost_alternative mode. Required when explanation_mode is "ghost_alternative".',
          properties: {
            ghost_path: {
              type: 'array',
              items: { type: 'string' },
              description: 'Node IDs forming the alternative path (graph + tree renderers)',
            },
            actual_path: {
              type: 'array',
              items: { type: 'string' },
              description: 'Node IDs of the actual chosen path (graph + tree renderers)',
            },
            ghost_indices: {
              type: 'array',
              items: { type: 'number' },
              description: '0-based indices for the alternative choice (array + linked renderers)',
            },
            actual_indices: {
              type: 'array',
              items: { type: 'number' },
              description: '0-based indices for the actual choice (array + linked renderers)',
            },
            ghost_label: {
              type: 'string',
              description: 'Label for the ghost/alternative (e.g., "cost: 7")',
            },
            actual_label: {
              type: 'string',
              description: 'Label for the actual choice (e.g., "cost: 6")',
            },
          },
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
          description:
            'Additional viz actions (same as emit_segment). Applied AFTER explanation mode setup.',
        },
      },
      required: ['answer', 'explanation_mode'],
    },
  },
];
