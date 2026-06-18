# Build Spec: Deploy SPA Bundle

## Overview
 
`Deploy SPA Bundle` is a Frends-protected HTTP `POST` Process that receives a base64-encoded single-file SPA bundle from CI, validates it, writes it to a unique versioned filename, and flips the `current.txt` pointer last. The pointer flip is the atomic commit: the serving Process never sees a partially uploaded bundle.

## Intent Coverage Matrix

| Class | Requirement | Implemented by | Builder assertion |
|---|---|---|---|
| Functional | Receive deploy uploads via Frends API Policy protected HTTP POST | HTTP Trigger `Deploy SPA Bundle`, `httpMethod=POST`, `routeTemplate=spa-deploy`, `auth=ApiPolicy`, `corsEnabled=false` | `mustBeTriggerType=http`, `configEquals` |
| Functional | Decode `#trigger.data.httpBody` once from base64 | Script `Decode And Validate Bundle` | `expressionContains=FromBase64String(#trigger.data.httpBody)` |
| Functional | Validate marker and size limit | Script `Decode And Validate Bundle`, Decision `Bundle Valid?` | `element=Bundle Valid?`, `mustBeType=decision` |
| Functional | Ensure serving directory exists before any file write | Task `Create Serving Directory` | `mustUsePackage=Frends.Files.CreateDirectory`, `parameterContains=spa.ServingPath` |
| Functional | Write unique versioned bundle before pointer flip | Task `Write Versioned Bundle` after `Create Serving Directory` | `mustUsePackage=Frends.Files.Write`, `parameterContains=WriteBehaviour=Throw` |
| Functional | Flip pointer last | Task `Flip Current Pointer` after `Write Versioned Bundle` | `mustUsePackage=Frends.Files.Write`, `parameterContains=WriteBehaviour=Overwrite` |
| Functional | Return installed version on success | Return `Return Deployed` | `parameterContains=version` |
| Scope control | Authentication is not implemented inside the Process | Frends API Management / API Policy | No `x-api-key` Script or authorization Decision in the Process |
| Scope control | Retry is not implemented inside the Process | CI/client retries | No Task retry metadata |
| Scope control | DLQ-equivalent persistence is not implemented inside the Process | Frends instance logs and HTTP failure response | No Shared State write |

## Prerequisites

- Development Environment ID: `51`.
- Development Agent Group ID: `51`, internal name `Default`.
- Task packages installed in the tenant: live catalog resolves `Frends.Files.CreateDirectory` as `Frends.Files.CreateDirectory.1.1.0` and `Frends.Files.Write` as `Frends.Files.Write.1.3.0`.
- The Agent can create/write `spa.ServingPath`; Development default is `/frends-data/spa`.
- Frends API Management policy protects `POST /spa-deploy`; any deploy credential belongs to API Management, not to this Process.

## Environment Variables

| Name | Type | Purpose | Referenced in | Development |
|---|---|---|---|---|
| `spa.ServingPath` | String | Directory for versioned bundles and pointer file | `Create Serving Directory`, `Write Versioned Bundle`, `Flip Current Pointer` | `/frends-data/spa` |
| `spa.CurrentPointer` | String | Pointer filename whose contents identify the active bundle | `Flip Current Pointer` | `current.txt` |
| `spa.MaxBundleBytes` | Number | Max decoded bundle byte count | `Decode And Validate Bundle` | `5242880` |

## Process Definition

**Triggered by:** HTTP Trigger `POST /spa-deploy`  
**Agent Group:** Development `Default`  
**Called Subprocesses:** None  
**Returns:** HTTP JSON result.

### Resilience & Retry Policy

No internal retry is configured. The CI/client caller owns retry behavior. If a write fails, the Frends Task fails the Process instance and the HTTP request receives a failure response.

### Failure Routing & DLQ

No DLQ-equivalent Shared State write is configured. Frends instance logs and the HTTP response are the operational failure signal.

| Failure mode | Detected by | Response |
|---|---|---|
| Missing or invalid API credential | Frends API Management policy | Frends gateway `401`/`403`; Process does not start |
| Invalid base64, empty bundle, missing marker, or oversize | `Decode And Validate Bundle` and Decision `Bundle Valid?` | Process returns `400`; no file writes |
| Directory creation, versioned write, or pointer write fails | `Frends.Files.CreateDirectory` or `Frends.Files.Write` Task exception | Process fails; Frends logs the error; caller receives failure response |

### Idempotency & Delivery Semantics

- **Delivery semantics:** at-least-once for client retries.
- **Dedup key:** versioned filename generated from UTC timestamp to millisecond precision.
- **Safe to replay?:** yes. Replays create a new immutable version and pointer overwrite is the final commit.
- **Atomicity:** old version remains active unless both writes succeed and the pointer flip completes.

### Observability

- Frends logs the Process instance and Task error details.
- API Management handles unauthorized requests before the Process starts.
- Successful responses include the deployed version filename.

### Parameterization Inventory

| Value class | Used by | Environment Variable | Notes |
|---|---|---|---|
| Serving path | Directory creation and file write paths | `#env.spa.ServingPath` | Per Environment |
| Pointer filename | Pointer write path | `#env.spa.CurrentPointer` | Per Environment |
| Bundle byte limit | Validation script | `#env.spa.MaxBundleBytes` | Tunable |

### Flow Diagram

```mermaid
flowchart TD
  T([HTTP POST Deploy SPA Bundle]) --> D[Decode And Validate Bundle]
  D --> V{Bundle Valid?}
  V -- no --> R400([Return 400])
  V -- yes --> VN[Assign Version]
  VN --> CD[Files CreateDirectory: Create Serving Directory]
  CD --> W1[Files Write: Write Versioned Bundle]
  W1 --> W2[Files Write: Flip Current Pointer]
  W2 --> OK([Return 200 version])
```

### Trigger Configuration

**Trigger:** HTTP Trigger
- **Display name:** `Deploy SPA Bundle`
- **HTTP method:** `POST`
- **Route template:** `spa-deploy`
- **Allowed schemes:** `HTTPS`
- **Authentication:** `API Policy`
- **CORS:** disabled; allowed origins empty
- **Public:** off/private (`isPrivate=true`, `isPublic=false`)

### Shape Sequence

1. **Trigger:** `Deploy SPA Bundle`
2. **Script:** `Decode And Validate Bundle`
   - Decodes `#trigger.data.httpBody` with `System.Convert.FromBase64String`.
   - Validates non-empty HTML, marker `id="app"`, and byte count <= `#env.spa.MaxBundleBytes`.
   - Assigns variable `bundle`.
3. **Exclusive Decision:** `Bundle Valid?`
   - Condition: `#var.bundle.IsValid == true`
   - No/default: `Return Invalid Bundle`
4. **Assign Variable:** `Assign Version`
   - Variable: `version`
   - Expression: `"index." + System.DateTime.UtcNow.ToString("yyyyMMdd'T'HHmmssfff'Z'") + ".html"`
5. **Task:** `Create Serving Directory`
   - `Frends.Files.CreateDirectory`
   - `Directory=#env.spa.ServingPath`
   - Creates all directories/subdirectories in the path unless they already exist.
6. **Task:** `Write Versioned Bundle`
   - `Frends.Files.Write`
   - `Content=#var.bundle.Html`
   - `Path=#env.spa.ServingPath + "/" + #var.version`
   - UTF-8, no BOM, `WriteBehaviour=Throw`
7. **Task:** `Flip Current Pointer`
   - `Frends.Files.Write`
   - `Content=#var.version`
   - `Path=#env.spa.ServingPath + "/" + #env.spa.CurrentPointer`
   - UTF-8, no BOM, `WriteBehaviour=Overwrite`
8. **Return:** `Return Deployed`
   - HTTP `200`, `application/json`, content `{"version":"<filename>"}`

### Return Value

- `Return Deployed`: HTTP `200`, `application/json`, content `{"version":"<filename>"}`.
- `Return Invalid Bundle`: HTTP `400`, `application/json`, content `{"error":"invalid bundle"}`.
- Directory creation and file write failures are unhandled Process failures by design; Frends logs the Task error and the client receives the runtime failure response.

## Test Plan

1. Import with `--conflict NewVersion` and deploy to Development Agent Group `51` with active triggers.
2. Verify the deployment shows as `Deploy SPA Bundle`, same process GUID, newest build version.
3. Call the endpoint without a valid Frends API Management key and expect gateway `401`/`403`; no Process execution should be logged.
4. Call the endpoint with a valid Frends API Management key and base64 HTML missing `id="app"`; expect Process HTTP `400`.
5. Call the endpoint with a valid Frends API Management key and minimal valid base64 HTML containing `id="app"`; expect HTTP `200` with `{"version":"index.<timestamp>.html"}` if the Agent has permission to create/write `/frends-data/spa`.
