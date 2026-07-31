// A synthetic 10-file "ride-hailing backend" sample, deliberately built
// with realistic legacy pain (undocumented rate tables, silent failures,
// a "don't touch this" comment) so the sample report and graph actually
// look like something real, not a 3-file toy. Same data shape the live
// scanner (api/scan.js) returns, so the same rendering code works for both.

const SAMPLE_DATA = {
  repo: "sample/ride-hailing-backend (illustrative, not a real repo)",
  language: "python",
  files_scanned: 10,
  files_available: 10,
  ai_enabled: false,
  dependency_graph: {
    main: ["api_gateway"],
    api_gateway: ["auth", "ride_service", "notification_service"],
    auth: ["user_repository"],
    ride_service: ["pricing_engine", "driver_matcher", "user_repository"],
    pricing_engine: ["legacy_rate_table"],
    driver_matcher: ["geo_utils"],
    notification_service: ["geo_utils"],
    user_repository: [],
    legacy_rate_table: [],
    geo_utils: [],
  },
  modules: [
    {
      module: "legacy_rate_table", path: "billing/legacy_rate_table.py", confidence: 25,
      functions: ["get_rate", "apply_surge", "region_adjustment"],
      magic_numbers: [1.0475, 0.925, 12.5, 0.98, 2.15, 1.6, 0.87],
      has_bare_except: false,
      flagged_comments: [{ line: 14, text: "# DO NOT CHANGE - finance team relies on exact output (see Q3 2019 audit)" }],
      suggested_next_steps: [
        "Extract the 7 undocumented constant(s) into named variables and confirm their meaning with whoever owns this business logic.",
        'Track down the person or incident referenced in this comment before changing the code it\'s attached to: "# DO NOT CHANGE - finance team relies on exact output (see Q3 2019 audit)"',
      ],
    },
    {
      module: "pricing_engine", path: "billing/pricing_engine.py", confidence: 38,
      functions: ["calculate_fare", "apply_discount", "round_fare"],
      magic_numbers: [0.15, 2.5, 100, 0.05],
      has_bare_except: true,
      flagged_comments: [],
      suggested_next_steps: [
        "Extract the 4 undocumented constant(s) into named variables and confirm their meaning with whoever owns this business logic.",
        "Add logging to the silent exception handler before touching this file - failures here are currently invisible.",
      ],
    },
    {
      module: "driver_matcher", path: "dispatch/driver_matcher.py", confidence: 55,
      functions: ["find_nearest", "score_driver", "rank_candidates"],
      magic_numbers: [5, 0.8, 3],
      has_bare_except: false,
      flagged_comments: [{ line: 22, text: "# TODO: this scoring weight was tuned by trial and error, ask Sam" }],
      suggested_next_steps: [
        "Extract the 3 undocumented constant(s) into named variables and confirm their meaning with whoever owns this business logic.",
        'Track down the person or incident referenced in this comment before changing the code it\'s attached to: "# TODO: this scoring weight was tuned by trial and error, ask Sam"',
      ],
    },
    {
      module: "notification_service", path: "messaging/notification_service.py", confidence: 60,
      functions: ["send_sms", "send_push", "retry_failed"],
      magic_numbers: [3, 30],
      has_bare_except: false,
      flagged_comments: [],
      suggested_next_steps: ["Extract the 2 undocumented constant(s) into named variables and confirm their meaning with whoever owns this business logic."],
    },
    {
      module: "ride_service", path: "core/ride_service.py", confidence: 62,
      functions: ["request_ride", "cancel_ride", "complete_ride"],
      magic_numbers: [15],
      has_bare_except: false,
      flagged_comments: [],
      suggested_next_steps: ["Extract the 1 undocumented constant(s) into named variables and confirm their meaning with whoever owns this business logic."],
    },
    {
      module: "api_gateway", path: "core/api_gateway.py", confidence: 70,
      functions: ["route_request", "authenticate", "handle_error"],
      magic_numbers: [],
      has_bare_except: false,
      flagged_comments: [],
      suggested_next_steps: ["No specific red flags found - reasonable candidate to modernize first, lower risk of breaking something hidden."],
    },
    {
      module: "auth", path: "core/auth.py", confidence: 72,
      functions: ["verify_token", "issue_token"],
      magic_numbers: [],
      has_bare_except: false,
      flagged_comments: [],
      suggested_next_steps: ["No specific red flags found - reasonable candidate to modernize first, lower risk of breaking something hidden."],
    },
    {
      module: "user_repository", path: "data/user_repository.py", confidence: 80,
      functions: ["get_user", "save_user"],
      magic_numbers: [],
      has_bare_except: false,
      flagged_comments: [],
      suggested_next_steps: ["No specific red flags found - reasonable candidate to modernize first, lower risk of breaking something hidden."],
    },
    {
      module: "geo_utils", path: "utils/geo_utils.py", confidence: 85,
      functions: ["haversine_distance", "bounding_box"],
      magic_numbers: [],
      has_bare_except: false,
      flagged_comments: [],
      suggested_next_steps: ["No specific red flags found - reasonable candidate to modernize first, lower risk of breaking something hidden."],
    },
    {
      module: "main", path: "main.py", confidence: 90,
      functions: ["run"],
      magic_numbers: [],
      has_bare_except: false,
      flagged_comments: [],
      suggested_next_steps: ["No specific red flags found - reasonable candidate to modernize first, lower risk of breaking something hidden."],
    },
  ],
};

SAMPLE_DATA.modules.sort((a, b) => a.confidence - b.confidence);
