# Unit 4 课堂模块接口 v1

一个环节由已安装的模块、教案里的配置和课堂中的一次运行共同确定。模块可在多个教案中复用。教案配置和接口样例为首期实现依据。

## 标识与版本

| 字段 | 含义 |
| --- | --- |
| `apiVersion` | 模块与教案使用的接口版本。首期为 `1`。 |
| `moduleId@version` | 模块实现版本，例如 `single-choice@1.0.0`。发布后固定配置结构、运行规则与素材引用。 |
| `stepId` | 一份教案中的环节 ID。同一个模块可被多个环节使用。 |
| `runId` | 某环节在某场课的一次运行。再次发起分配新编号。 |
| `type@version` | 一个输入或输出的数据类型，例如 `class.poll-distribution@1`。 |

## 模块清单

每个模块声明配置结构、支持的视图与动作、命名输入输出和可用时机。下面是单选模块清单的示例。投影和主持可以使用框架的通用视图，模块也可以提供定制界面。

```json
{
  "apiVersion": 1,
  "id": "single-choice",
  "version": "1.0.0",
  "configSchema": "single-choice.config@1",
  "views": ["host", "student", "projection"],
  "actions": ["submit", "lock", "reveal", "complete"],
  "inputs": {},
  "outputs": {
    "distribution": {
      "type": "class.poll-distribution@1",
      "scope": "class",
      "audience": ["host", "student", "projection"],
      "availableAt": "revealed"
    }
  }
}
```

首期用 JSON Schema 校验字段和载荷，用模块与类型注册表解析清单中的版本引用。运行时只加载已注册的模块。模块接口提供课堂配置、授权输入和提交能力。服务端统一负责身份、事务与状态分发。

## 教案编排

首期支持有序环节、前序结果绑定和现场跳过。下面的 Reading 2 教案把书评题揭晓后的班级分布交给讨论环节。

```json
{
  "apiVersion": 1,
  "id": "unit4-reading2",
  "version": "1.0.0",
  "steps": [
    {
      "id": "read",
      "use": "reading@1.0.0",
      "config": { "resource": "reading-2-excerpt@1" }
    },
    {
      "id": "reviews",
      "use": "single-choice@1.0.0",
      "config": { "item": "reading-2-research-question@1" }
    },
    {
      "id": "discuss",
      "use": "discussion@1.0.0",
      "bind": {
        "evidence": { "from": "reviews.distribution", "onMissing": "omit" }
      },
      "config": { "fallbackPrompt": "What did the researchers actually analyze?" }
    },
    {
      "id": "exit",
      "use": "short-answer@1.0.0",
      "config": { "prompt": "Write one claim the study supports and explain its scope." }
    }
  ]
}
```

`discussion@1.0.0` 的 `evidence` 是班级范围的可选输入，接收 `class.poll-distribution@1`。该类型包含稳定的选项 ID、各选项人数、总作答数和结果来源。班级真实作答和模拟数据分别标明来源。总作答数为零仍是一份有效结果，可以显示「本轮无作答」。跳过投票、轮次中止或尚未揭晓时才按 `onMissing` 处理。

发布时校验 `stepId` 唯一、模块与素材版本存在、源环节在前、输出与输入类型和范围匹配。只有可选输入允许 `omit`。必填数据在可能被跳过的路径上应配置兼容的备用值，或在运行时由主持处理明确的缺失提示。角色与阶段权限随数据一并检查，投影只得到允许公开的结果。

启动讨论时固定输入所用的上游 `runId` 与结果版本。重新发起投票可供后续新运行使用，已开始的讨论继续引用原结果。主持若跳过来源步骤，使用教案指定的缺省行为。

## 模块运行接口

课堂运行有 `active`、`completed`、`aborted`。纯展示和计时模块使用开始与完成。收答模块另有 `open`、`locked`，声明揭晓能力时再进入 `revealed`。跳过尚未发起的环节记在教案进度中。中止已发起的环节保留该次运行记录。

```ts
type MountedView<ViewState> = {
  update(snapshot: ViewState): void;
  destroy(): void;
};

type ViewContext<ViewState> = {
  role: "host" | "student" | "projection";
  runId: string;
  config: Readonly<Record<string, unknown>>;
  inputs: Readonly<Record<string, unknown>>;
  snapshot: ViewState;
  submit(action: string, payload: unknown): Promise<unknown>;
};

interface ModuleView<ViewState> {
  mount(root: HTMLElement, context: ViewContext<ViewState>): MountedView<ViewState>;
}
```

`submit(action, payload)` 通过运行环境发送带幂等标识的请求。模块用 `update` 接收授权状态。切换环节时用 `destroy` 清理定时器、音频和监听。现有 `ctx.send(choice)` 可适配为 `submit("submit", { choice })`。

| HTTP 接口 | 职责 |
| --- | --- |
| `POST /api/v1/sessions/{sessionId}/commands` | 执行教案层动作，例如跳过未开始的环节。 |
| `POST /api/v1/sessions/{sessionId}/steps/{stepId}/runs` | 主持发起环节，解析授权输入，返回新运行编号。 |
| `POST /api/v1/sessions/{sessionId}/runs/{runId}/commands` | 执行模块声明的动作，例如提交、锁定、揭晓和完成。 |
| `GET /api/v1/sessions/{sessionId}/snapshot` | 读取当前角色可见的场次和运行状态。 |
| `GET /api/v1/sessions/{sessionId}/events` | 接收带房间版本的状态更新。 |

写请求带 `requestId`，主持操作带预期的 `controlVersion`，可修订提交带预期的 `submissionRevision`。服务端从已认证的会话识别作答主体，校验动作权限后查同一请求的回执，再校验首次执行的阶段和版本。稳定错误码至少覆盖房间或运行已切换、已锁定、版本冲突和无权操作。

对外接入可按实际需求映射 QTI 题库、Common Cartridge 课程资源和 LTI 教学平台入口。首期 HTTP 文档可用 OpenAPI 描述。[JSON Schema](https://json-schema.org/draft/2020-12) · [OpenAPI](https://spec.openapis.org/oas/v3.1.1.html) · [QTI](https://www.1edtech.org/standards/qti) · [Common Cartridge](https://www.1edtech.org/standards/cc) · [LTI](https://www.1edtech.org/standards/lti)

[后端架构](backend-architecture.md) · [开发流程和首期验收](development-workflow.md)
