import React, {useEffect, useState} from "react";
import {
    Button,
    Col,
    Divider,
    Image,
    Input,
    Layout,
    Menu,
    Modal,
    Popconfirm,
    Popover,
    Row,
    Space,
    Spin,
    Tabs,
    Tag
} from "antd";
import {ContentByRoute, MenuDataProps, Route, RouteMenuData} from "../routes/routeSpec";
import {
    CloseOutlined,
    EditOutlined,
    EllipsisOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    ReloadOutlined
} from "@ant-design/icons"
import {failed, info, success} from "../utils/notification";
import {showModal} from "../utils/showModal";
import {YakLogoData} from "../utils/logo";
import {AutoUpdateYakModuleButton, YakitVersion, YakVersion} from "../utils/basic";
import {CompletionTotal, setCompletions} from "../utils/monacoSpec/yakCompletionSchema";
import {randomString} from "../utils/randomUtil";
import MDEditor from '@uiw/react-md-editor';
import {genDefaultPagination, QueryYakScriptRequest, QueryYakScriptsResponse, YakScript} from "./invoker/schema";
import {showByCursorContainer} from "../utils/showByCursor";

export interface MainProp {
    tlsGRPC?: boolean
    addr?: string
    onErrorConfirmed?: () => any
}

const {TabPane} = Tabs;
const {ipcRenderer} = window.require("electron");
const MenuItem = Menu.Item;

const {Header, Footer, Content, Sider} = Layout;


interface MenuItemGroup {
    Group: string
    Items: { Group: string, YakScriptId: number, Verbose: string }[]
}

interface PluginMenuItem {
    Group: string,
    YakScriptId: number,
    Verbose: string
};

interface PageCache {
    id: string
    verbose: string
    node: React.ReactNode | any
    route: Route;
}

const singletonRoute = [
    Route.HTTPHacker, Route.ShellReceiver,
]

export const Main: React.FC<MainProp> = (props) => {
    const [route, setRoute] = useState<any>(Route.HTTPHacker);
    const [collapsed, setCollapsed] = useState(false);
    const [engineStatus, setEngineStatus] = useState<"ok" | "error">("ok");
    const [status, setStatus] = useState<{ addr: string, isTLS: boolean }>();
    const [hideMenu, setHideMenu] = useState(false);
    const [menuItems, setMenuItems] = useState<MenuItemGroup[]>([]);
    const [loading, setLoading] = useState(false);
    const [pageCache, setPageCache] = useState<PageCache[]>([
        {
            node: <div style={{overflow: "auto"}}>
                {ContentByRoute(Route.HTTPHacker)}
            </div>,
            id: "", route: Route.HTTPHacker,
            verbose: "MITM"
        }
    ]);
    const [extraGeneralModule, setExtraGeneralModule] = useState<YakScript[]>([]);
    const [notification, setNotification] = useState("");

    // 多开 tab 页面
    const [currentTabKey, setCurrentTabKey] = useState("");
    const [tabLoading, setTabLoading] = useState(false);

    const closeCacheByRoute = (r: Route) => {
        setPageCache(pageCache.filter(i => `${i.route}` !== `${r}`))
    }

    const closeAllCache = () => {
        Modal.confirm({
            title: "确定要关闭所有 Tabs？",
            content: "这样将会关闭所有进行中的进程",
            onOk: () => {
                setPageCache([])
            }
        })
    }

    const closeOtherCache = (id: string) => {
        Modal.confirm({
            title: "确定要除此之外所有 Tabs？",
            content: "这样将会关闭所有进行中的进程",
            onOk: () => {
                setPageCache(pageCache.filter(i => i.id === id))
            }
        })
    }

    const removeCache = (id: string) => {
        setPageCache(pageCache.filter(i => i.id !== id))
    };
    const appendCache = (id: string, verbose: string, node: any, route: Route) => {
        setPageCache([...pageCache, {id, verbose, node, route}])
    };

    const getCacheIndex = (id: string) => {
        const targets = pageCache.filter(i => i.id === id);
        return targets.length > 0 ?
            pageCache.indexOf(targets[0]) : -1
    };

    const updateCacheVerbose = (id: string, verbose: string) => {
        const index = getCacheIndex(id);
        if (index < 0) {
            return;
        }
        pageCache[index].verbose = verbose
        setPageCache([...pageCache])
    };

    const setCurrentTabByRoute = (r: Route) => {
        const targets = pageCache.filter(i => i.route === r)
        if (targets.length > 0) {
            setCurrentTabKey(targets[0].id)
        }
    }

    const routeExistedCount = (r: Route) => {
        const targets = pageCache.filter(i => {
            return i.route === r
        })
        return targets.length
    };

    const updateMenuItems = () => {
        setLoading(true)
        ipcRenderer.invoke("GetAllMenuItem", {}).then((data: { Groups: MenuItemGroup[] }) => {
            setMenuItems(data.Groups)
        }).catch(e => {
            failed("Update Menu Item Failed")
        }).finally(() => {
            setTimeout(() => {
                setLoading(false)
            }, 300)
        })

        ipcRenderer.invoke("QueryYakScript", {
            Pagination: genDefaultPagination(1000), IsGeneralModule: true,
            Type: "yak",
        } as QueryYakScriptRequest).then((data: QueryYakScriptsResponse) => {
            setExtraGeneralModule(data.Data)
        })
    }

    useEffect(() => {
        if (engineStatus === "error") {
            props.onErrorConfirmed && props.onErrorConfirmed()
        }
    }, [engineStatus])

    useEffect(() => {
        updateMenuItems()
    }, [])

    // 加载补全
    useEffect(() => {
        ipcRenderer.invoke("GetYakitCompletionRaw").then((data: { RawJson: Uint8Array }) => {
            const completionJson = Buffer.from(data.RawJson).toString("utf8")
            setCompletions(JSON.parse(completionJson) as CompletionTotal)
            // success("加载 Yak 语言自动补全成功 / Load Yak IDE Auto Completion Finished")
        })
    }, [])

    useEffect(() => {
        ipcRenderer.invoke("yakit-connect-status").then((data) => {
            setStatus(data)
        })

        ipcRenderer.on("client-engine-status-ok", (e, reason) => {
            if (engineStatus !== "ok") setEngineStatus("ok")
        })
        ipcRenderer.on("client-engine-status-error", (e, reason) => {
            if (engineStatus === "ok") setEngineStatus("error")
        })

        let id = setInterval(() => {
            ipcRenderer.invoke("engine-status").catch(e => {
                setEngineStatus("error")
            }).finally(() => {
            })
        }, 1000)
        return () => {
            ipcRenderer.removeAllListeners("client-engine-status-error")
            ipcRenderer.removeAllListeners("client-engine-status-ok")
            clearInterval(id)
        }
    }, [])

    useEffect(() => {
        ipcRenderer.invoke("query-latest-notification").then((e: string) => {
            setNotification(e)

            if (e) {
                success(<>
                    <Space direction={"vertical"}>
                        <span>来自于 yaklang.io 的通知</span>
                        <Button type={"link"} onClick={() => {
                            showModal({
                                title: "Notification",
                                content: <>
                                    <MDEditor.Markdown source={e}/>
                                </>
                            })
                        }}>点击查看</Button>
                    </Space>
                </>)
            }
        })
    }, [])

    const pluginKey = (item: PluginMenuItem) => `plugin:${item.Group}:${item.YakScriptId}`;
    const routeKeyToLabel = new Map<string, string>();
    RouteMenuData.forEach(k => {
        (k.subMenuData || []).forEach(subKey => {
            routeKeyToLabel.set(`${subKey.key}`, subKey.label)
        })

        routeKeyToLabel.set(`${k.key}`, k.label)
    })
    menuItems.forEach(k => {
        k.Items.forEach(value => {
            routeKeyToLabel.set(pluginKey(value), value.Verbose)
        })
    })

    return (
        <Layout style={{width: "100%", height: "100vh"}}>
            <Layout>
                <Header
                    style={{
                        paddingLeft: 0, paddingRight: 0,
                        backgroundColor: "#fff", height: 60
                    }}

                >
                    <Row>
                        <Col span={8}>
                            <Space>
                                <div style={{marginLeft: 8, textAlign: "center", height: 60}}>
                                    <Image
                                        src={YakLogoData} preview={false}
                                        width={64}
                                    />
                                </div>
                                <YakVersion/>
                                <Divider type={"vertical"}/>
                                <YakitVersion/>
                                {!hideMenu && <Button
                                    style={{marginLeft: 4, color: "#207ee8"}}
                                    type={"ghost"} ghost={true}
                                    onClick={e => {
                                        setCollapsed(!collapsed)
                                    }}
                                    icon={
                                        collapsed ? <MenuUnfoldOutlined/> : <MenuFoldOutlined/>
                                    }
                                />}
                                <Button
                                    style={{marginLeft: 4, color: "#207ee8"}}
                                    type={"ghost"} ghost={true}
                                    onClick={e => {
                                        updateMenuItems()
                                    }}
                                    icon={
                                        <ReloadOutlined/>
                                    }
                                >

                                </Button>
                            </Space>
                        </Col>
                        <Col span={16} style={{textAlign: "right", paddingRight: 28}}>
                            <Space>
                                {status?.isTLS ? <Tag color={"green"}>TLS:通信已加密</Tag> : <Tag color={"red"}>
                                    通信未加密
                                </Tag>}
                                {status?.addr && <Tag color={"geekblue"}>{status?.addr}</Tag>}
                                <Tag color={engineStatus === "ok" ? "green" : "red"}>Yak 引擎状态：{engineStatus}</Tag>
                                <AutoUpdateYakModuleButton/>
                                <Popconfirm
                                    title={"确认需要退出当前会话吗？"}
                                    onConfirm={() => {
                                        success("退出当前 Yak 服务器成功")
                                        setEngineStatus("error")
                                    }}
                                >
                                    <Button danger={true}>退出 / 切换 Yak 服务器</Button>
                                </Popconfirm>
                            </Space>
                        </Col>
                    </Row>
                </Header>
                <Content style={{
                    margin: 12, backgroundColor: "#fff",
                    overflow: "auto"
                }}>
                    <Layout style={{height: "100%"}}>
                        {!hideMenu && <Sider
                            style={{backgroundColor: "#fff", overflow: "auto"}}
                            collapsed={collapsed}
                            // onCollapse={r => {
                            //     setCollapsed(r)
                            // }}
                        >
                            <Spin spinning={loading}>
                                <Space direction={"vertical"} style={{
                                    width: "100%",
                                }}>
                                    <Menu
                                        theme={"light"} style={{}}
                                        onSelect={(e) => {
                                            if (e.key === "ignore") {
                                                return
                                            }

                                            if (singletonRoute.includes(e.key as Route) && routeExistedCount(e.key as Route) > 0) {
                                                setCurrentTabByRoute(e.key as Route)
                                            } else {
                                                const newTabId = `${e.key}-[${randomString(49)}]`;
                                                const verboseNameRaw = routeKeyToLabel.get(e.key) || `${e.key}`;
                                                appendCache(
                                                    newTabId,
                                                    `${verboseNameRaw}[${pageCache.length + 1}]`,
                                                    <div style={{overflow: "auto"}}>
                                                        {ContentByRoute(e.key)}
                                                    </div>, e.key as Route,
                                                );
                                                setCurrentTabKey(newTabId)
                                            }

                                            // 增加加载状态
                                            setTabLoading(true)
                                            setTimeout(() => {
                                                setTabLoading(false)
                                            }, 300)

                                            setRoute(e.key)
                                        }}
                                        mode={"inline"}
                                    >
                                        {menuItems.map(i => {
                                            if (i.Group === "UserDefined") {
                                                i.Group = "社区插件"
                                            }
                                            return <Menu.SubMenu
                                                icon={<EllipsisOutlined/>}
                                                key={i.Group} title={i.Group}
                                            >
                                                {i.Items.map(item => {
                                                    return <MenuItem
                                                        icon={<EllipsisOutlined/>}
                                                        key={`plugin:${item.Group}:${item.YakScriptId}`}
                                                    >
                                                        {item.Verbose}
                                                    </MenuItem>
                                                })}
                                            </Menu.SubMenu>
                                        })}
                                        {(RouteMenuData || []).map(i => {
                                            if (i.subMenuData) {
                                                if (i.key === `${Route.GeneralModule}`) {
                                                    const extraMenus = extraGeneralModule.map(i => {
                                                        return {
                                                            icon: <EllipsisOutlined/>,
                                                            key: `plugin:${i.Id}`,
                                                            label: i.GeneralModuleVerbose,
                                                        } as MenuDataProps
                                                    })
                                                    i.subMenuData.push(...extraMenus)
                                                    let subMenuMap = new Map<string, MenuDataProps>();
                                                    i.subMenuData.forEach(e => {
                                                        subMenuMap.set(e.key as string, e)
                                                    })
                                                    i.subMenuData = []
                                                    subMenuMap.forEach(v => i.subMenuData?.push(v));
                                                    i.subMenuData.sort((a, b) => a.label.localeCompare(b.label))
                                                }
                                                i.subMenuData.sort((a, b) => (a.disabled ? 1 : 0) - (b.disabled ? 1 : 0))
                                                return <Menu.SubMenu
                                                    icon={i.icon} key={i.key} title={i.label}
                                                >
                                                    {(i.subMenuData || []).map(subMenu => {
                                                        return <MenuItem icon={subMenu.icon} key={subMenu.key}
                                                                         disabled={subMenu.disabled}>
                                                            {subMenu.label}
                                                        </MenuItem>
                                                    })}
                                                </Menu.SubMenu>
                                            }
                                            return <MenuItem icon={i.icon} key={i.key} disabled={i.disabled}>
                                                {i.label}
                                            </MenuItem>
                                        })}
                                    </Menu>
                                </Space>
                            </Spin>
                        </Sider>}
                        <Content style={{
                            overflow: "auto",
                            backgroundColor: "#fff",
                            marginLeft: 12, height: "100%",
                        }}>
                            <div style={{padding: 12, paddingTop: 8, height: "100%"}}>
                                {pageCache.length > 0 ? <Tabs
                                    activeKey={currentTabKey}
                                    onChange={setCurrentTabKey}
                                    size={"small"} type={"editable-card"}
                                    renderTabBar={(props, TabBarDefault) => {
                                        return <>
                                            <TabBarDefault {...props}/>
                                        </>
                                    }}
                                    onEdit={(key: any, event: string) => {
                                        switch (event) {
                                            case "remove":
                                                // hooked by tabs closeIcon
                                                return
                                            case "add":
                                                if (collapsed) {
                                                    setCollapsed(false)
                                                } else {
                                                    info("请从左边菜单连选择需要新建的 Tab 窗口")
                                                }
                                                return
                                        }

                                    }}
                                >

                                    {pageCache.map(i => {
                                        return <Tabs.TabPane
                                            key={i.id} tab={i.verbose}
                                            closeIcon={<Space>
                                                <Popover
                                                    trigger={"click"}
                                                    title={"修改名称"}
                                                    content={<>
                                                        <Input size={"small"}
                                                               defaultValue={i.verbose}
                                                               onBlur={(e) => {
                                                                   updateCacheVerbose(i.id, e.target.value)
                                                               }}/>
                                                    </>}
                                                >
                                                    <EditOutlined/>
                                                </Popover>
                                                <CloseOutlined
                                                    onContextMenu={(e) => {
                                                        showByCursorContainer({
                                                            content: <>
                                                                <Space direction={"vertical"}>
                                                                    <Button
                                                                        type={"link"}
                                                                        onClick={() => {
                                                                            closeAllCache()
                                                                        }}
                                                                        size={"small"}>关闭所有Tabs</Button>
                                                                    <Button type={"link"}
                                                                            onClick={() => closeCacheByRoute(i.route)}
                                                                            size={"small"}>关闭同类Tabs</Button>
                                                                    <Button type={"link"}
                                                                            onClick={() => closeOtherCache(i.id)}
                                                                            size={"small"}>关闭其他Tabs</Button>
                                                                </Space>
                                                            </>
                                                        }, e.clientX, e.clientY)
                                                    }}
                                                    onClick={() => {
                                                        setTabLoading(true)
                                                        const key = i.id;
                                                        const targetIndex = getCacheIndex(key)
                                                        if (targetIndex > 0 && pageCache[targetIndex - 1]) {
                                                            const targetCache = pageCache[targetIndex - 1];
                                                            setCurrentTabKey(targetCache.id)
                                                        }
                                                        removeCache(key);
                                                        setTimeout(() => setTabLoading(false), 300)
                                                    }}/>
                                            </Space>}>
                                            <Spin spinning={tabLoading}>
                                                {i.node}
                                            </Spin>
                                        </Tabs.TabPane>
                                    })}
                                </Tabs> : <>

                                </>}
                            </div>
                        </Content>
                    </Layout>

                </Content>
            </Layout>
        </Layout>
    );
};