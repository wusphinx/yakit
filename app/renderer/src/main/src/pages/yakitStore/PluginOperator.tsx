import React, { useEffect, useState } from "react"
import { Button, Divider, Form, PageHeader, Popconfirm, Popover, Space, Switch, Tabs, Tag } from "antd"
import { YakScript } from "../invoker/schema"
import { failed, success } from "../../utils/notification"
import { formatTimestamp } from "../../utils/timeUtil"
import { CopyableField, InputItem } from "../../utils/inputUtil"
import { YakEditor } from "../../utils/editors"
import { showDrawer, showModal } from "../../utils/showModal"
import { PluginExecutor } from "./PluginExecutor"
import { DocumentEditor } from "./DocumentEditor"
import MDEditor from "@uiw/react-md-editor"
import { PluginHistoryTable } from "./PluginHistory"
import { openABSFile } from "../../utils/openWebsite"
import { EditOutlined } from "@ant-design/icons"
import { YakScriptCreatorForm } from "../invoker/YakScriptCreator"
import { YakScriptExecResultTable } from "../../components/YakScriptExecResultTable"

export interface YakScriptOperatorProp {
    yakScriptId: number
    size?: "big" | "small"
    fromMenu?: boolean
}

const { ipcRenderer } = window.require("electron")

export const PluginOperator: React.FC<YakScriptOperatorProp> = (props) => {
    const [script, setScript] = useState<YakScript>()
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(false)
    const [groups, setGroups] = useState<string[]>([])
    const [markdown, setMarkdown] = useState("")
    const [trigger, setTrigger] = useState(false)
    const [details, setDetails] = useState(true)

    const updateGroups = () => {
        ipcRenderer
            .invoke("QueryGroupsByYakScriptId", { YakScriptId: props.yakScriptId })
            .then((data: { Groups: string[] }) => {
                setGroups(data.Groups)
            })
            .catch((e) => {
                console.info(e)
            })
            .finally()
    }

    const update = () => {
        if (props.yakScriptId <= 0) {
            return
        }
        updateGroups()

        setLoading(true)
        ipcRenderer
            .invoke("GetYakScriptById", { Id: props.yakScriptId })
            .then((e: YakScript) => {
                setScript(e)
                if (e.IsGeneralModule) {
                    setDetails(false)
                } else {
                    setDetails(true)
                }
                ipcRenderer
                    .invoke("GetMarkdownDocument", {
                        YakScriptId: e?.Id,
                        YakScriptName: e?.ScriptName
                    })
                    .then((data: { Markdown: string }) => {
                        setMarkdown(data.Markdown)
                    })
                    .catch((e) => {
                        setMarkdown("")
                    })
            })
            .catch((e) => {
                failed("Query YakScript By ID failed")
            })
            .finally(() =>
                setTimeout(() => {
                    setTrigger(!trigger)
                    setLoading(false)
                }, 300)
            )
    }

    useEffect(() => {
        update()
    }, [props.yakScriptId])

    return (
        <div style={{ marginLeft: 16 }}>
            <PageHeader
                style={{ paddingLeft: 2, paddingBottom: 12 }}
                title={script?.ScriptName}
                subTitle={
                    <Space size={2}>
                        <Button
                            type={"link"}
                            onClick={(e) => {
                                let m = showDrawer({
                                    title: `修改插件: ${script?.ScriptName}`,
                                    width: "100%",
                                    content: (
                                        <>
                                            <YakScriptCreatorForm
                                                modified={script}
                                                onChanged={(i) => update()}
                                                onCreated={() => {
                                                    m.destroy()
                                                }}
                                            />
                                        </>
                                    ),
                                    keyboard: false
                                })
                            }}
                            icon={<EditOutlined />}
                        />
                        <span style={{ color: "#999" }}>
                            <span>详情：</span>
                            <Switch checked={details} size={"small"} onChange={setDetails} />
                        </span>
                    </Space>
                }
            >
                {details && (
                    <Space direction={"vertical"}>
                        <Space size={0}>
                            {script?.ScriptName && <Tag>{formatTimestamp(script?.CreatedAt)}</Tag>}
                            <Divider type={"vertical"} />
                            <p style={{ color: "#999999", marginBottom: 0 }}>Author: {script?.Author}</p>
                            <Divider type={"vertical"} />
                            {script?.Tags
                                ? (script?.Tags || "")
                                      .split(",")
                                      .filter((i) => !!i)
                                      .map((i) => {
                                          return <Tag key={i}>{i}</Tag>
                                      })
                                : "No Tags"}
                        </Space>
                        <Space>
                            <CopyableField noCopy={false} text={script?.Help} />
                        </Space>
                        <Space>
                            {script && (
                                <Button
                                    size={"small"}
                                    onClick={(e) => {
                                        let m = showDrawer({
                                            title: "编辑文档",
                                            keyboard: false,
                                            width: "94%",
                                            onClose: () => {
                                                update()
                                                m.destroy()
                                            },
                                            content: (
                                                <>
                                                    <DocumentEditor
                                                        onFinished={() => {
                                                            m.destroy()
                                                        }}
                                                        markdown={markdown}
                                                        yakScript={script}
                                                    />
                                                </>
                                            )
                                        })
                                    }}
                                >
                                    添加 / 修改文档
                                </Button>
                            )}
                            <Popover
                                title={`添加到左侧菜单栏中[${script?.Id}]`}
                                content={<>{script && <AddToMenuActionForm script={script} />}</>}
                            >
                                <Button size={"small"} type={"primary"}>
                                    添加到菜单栏
                                </Button>
                            </Popover>
                            {props.fromMenu && groups.length > 0 && (
                                <Button
                                    size={"small"}
                                    danger={true}
                                    onClick={(e) => {
                                        let m = showModal({
                                            title: "移除菜单栏",
                                            content: (
                                                <Space direction={"vertical"}>
                                                    {groups.map((element) => {
                                                        return (
                                                            <Button
                                                                onClick={() => {
                                                                    ipcRenderer
                                                                        .invoke("RemoveFromMenu", {
                                                                            YakScriptId: script?.Id,
                                                                            Group: element
                                                                        })
                                                                        .then(() => {
                                                                            updateGroups()
                                                                            m.destroy()
                                                                        })
                                                                        .catch((e) => {
                                                                            console.info(e)
                                                                        })
                                                                        .finally()
                                                                }}
                                                            >
                                                                从 {element} 中移除
                                                            </Button>
                                                        )
                                                    })}
                                                </Space>
                                            )
                                        })
                                    }}
                                >
                                    移除菜单栏
                                </Button>
                            )}
                            {script?.IsIgnore ? (
                                <>
                                    <Popconfirm
                                        title={"取消隐藏该模块？"}
                                        onConfirm={() => {
                                            ipcRenderer
                                                .invoke("UnIgnoreYakScript", { Id: script?.Id })
                                                .then((e) => {
                                                    success("显示该模块")
                                                })
                                                .catch((e) => {})
                                                .finally(() => {})
                                        }}
                                    >
                                        <Button size={"small"}>取消隐藏 / 取消忽略</Button>
                                    </Popconfirm>
                                </>
                            ) : (
                                <Popconfirm
                                    title={"忽略该模块将会导致模块在插件商店不可见，需要在插件商店中查看"}
                                    onConfirm={() => {
                                        ipcRenderer
                                            .invoke("IgnoreYakScript", { Id: script?.Id })
                                            .then((e) => {
                                                success("忽略该模块")
                                            })
                                            .catch((e) => {})
                                            .finally(() => {})
                                    }}
                                >
                                    <Button size={"small"} danger={true}>
                                        不再关注 / 隐藏
                                    </Button>
                                </Popconfirm>
                            )}
                            <Popconfirm
                                title={"导出成功后，将会自动打开导出的路径"}
                                onConfirm={(e) => {
                                    ipcRenderer
                                        .invoke("ExportYakScript", {
                                            YakScriptId: script?.Id
                                        })
                                        .then((data: { OutputDir: string }) => {
                                            showModal({
                                                title: "导出成功!",
                                                content: (
                                                    <>
                                                        <Space direction={"vertical"}>
                                                            <CopyableField text={data.OutputDir} />
                                                            <Button
                                                                type={"link"}
                                                                onClick={() => {
                                                                    openABSFile(data.OutputDir)
                                                                }}
                                                            >
                                                                在文件夹中打开
                                                            </Button>
                                                        </Space>
                                                    </>
                                                )
                                            })
                                        })
                                        .catch((e) => {
                                            console.info(e)
                                        })
                                }}
                            >
                                <Button size={"small"}>导出插件</Button>
                            </Popconfirm>
                        </Space>
                    </Space>
                )}
            </PageHeader>
            {/*<Divider/>*/}
            <Tabs type={"card"} defaultValue={"runner"}>
                <Tabs.TabPane tab={"执行器 / Runner"} key={"runner"}>
                    {script && <PluginExecutor script={script} size={props.size} />}
                </Tabs.TabPane>
                <Tabs.TabPane tab={"文档 / Docs"} key={"docs"} disabled={!markdown}>
                    <MDEditor.Markdown source={markdown} />
                </Tabs.TabPane>
                <Tabs.TabPane tab={"插件源码 / Source Code"} key={"code"}>
                    <div style={{ height: 500 }}>
                        <YakEditor type={script?.Type || "yak"} value={script?.Content} readOnly={true} />
                    </div>
                </Tabs.TabPane>
                <Tabs.TabPane tab={"执行历史 / History"} key={"history"}>
                    {script && <PluginHistoryTable script={script} trigger={trigger} />}
                    {/*<ExecHistoryTable mini={false} trigger={null as any}/>*/}
                </Tabs.TabPane>
                <Tabs.TabPane tab={"结果存储 / Results"} key={"results"}>
                    {script && <YakScriptExecResultTable YakScriptName={script.ScriptName} trigger={trigger} />}
                </Tabs.TabPane>
            </Tabs>
        </div>
    )
}

export interface AddToMenuActionFormProp {
    script: YakScript
}

export const AddToMenuActionForm: React.FC<AddToMenuActionFormProp> = (props) => {
    const { script } = props

    const [params, setParams] = useState<{
        Group: string
        YakScriptId: number
        Verbose: string
    }>({ Group: "社区组件", Verbose: props.script.ScriptName, YakScriptId: props.script.Id })

    useEffect(() => {
        setParams({ Group: "社区组件", Verbose: props.script.ScriptName, YakScriptId: props.script.Id })
    }, [props.script])

    return (
        <div>
            <Form
                size={"small"}
                onSubmitCapture={(e) => {
                    e.preventDefault()

                    if (!script) {
                        failed("No Yak Modeule Selected")
                        return
                    }

                    ipcRenderer
                        .invoke("AddToMenu", params)
                        .then(() => {
                            success("添加成功")
                        })
                        .catch((e) => {
                            failed(`${e}`)
                        })
                }}
            >
                <InputItem
                    label={"菜单选项名(展示名称)"}
                    setValue={(Verbose) => setParams({ ...params, Verbose })}
                    value={params.Verbose}
                />
                <InputItem
                    label={"菜单分组"}
                    setValue={(Group) => setParams({ ...params, Group })}
                    value={params.Group}
                />
                <Form.Item colon={false} label={" "}>
                    <Button type="primary" htmlType="submit">
                        {" "}
                        添加{" "}
                    </Button>
                </Form.Item>
            </Form>
        </div>
    )
}
