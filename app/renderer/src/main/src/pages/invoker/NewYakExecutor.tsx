import React, { useEffect, useRef, useState } from "react";
import {
  Layout,
  notification,
  Tabs,
  Space,
  Button,
  Card,
  Form,
  Tag,
} from "antd";
import { CloseOutlined } from "@ant-design/icons";
import { showByCursorContainer } from "../../utils/showByCursor";
import { SelectOne } from "../../utils/inputUtil";

import { ExecHistoryTable } from "./YakExecutorHistoryTable";
import "./xtermjs-yak-executor.css";
import { IMonacoEditor, YakEditor } from "../../utils/editors";
import {
  FolderOpenOutlined,
  FolderAddOutlined,
  DeleteOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { YakScriptManagerPage } from "./YakScriptManager";
import { getRandomInt, randomString } from "../../utils/randomUtil";
import { showDrawer, showModal } from "../../utils/showModal";
import { failed, info } from "../../utils/notification";
import { ExecResult, YakScript, YakScriptParam } from "./schema";
import { YakScriptParamsSetter } from "./YakScriptParamsSetter";
import { YakExecutorParam } from "./YakExecutorParams";
import {
  monacoEditorClear,
  monacoEditorWrite,
} from "../fuzzer/fuzzerTemplates";
import { XTerm } from "xterm-for-react";
import {
  writeExecResultXTerm,
  writeXTerm,
  xtermClear,
  xtermFit,
} from "../../utils/xtermUtils";
import { isPropertyAccessExpression } from "typescript";

const { ipcRenderer } = window.require("electron");

const { Header, Sider, Content, Footer } = Layout;

export interface YakExecutorProp {}

interface PageCache {
  key: string;
  title: string;
  code: string;
}

export const NewYakExecutor: React.FC<YakExecutorProp> = (props) => {
  const render = ipcRenderer;
  // 左侧文件栏
  // 内容栏
  const [pageCache, setPageCache] = useState<PageCache[]>([
    {
      key: "1",
      title: "test.yak",
      code: "# input your yak code\nprintln(`Hello Yak World!`)",
    },
    {
      key: "2",
      title: "test1.yak",
      code: "# input your yak code\nprintln(`Hello Yak World!`)",
    },
  ]);
  const [currentTabKey, setCurrentTabKey] = useState("1");
  const [untitledKey, setUntitledKey] = useState(1);
  // 终端栏
  const xtermRef = useRef(null);
  const [outputEncoding, setOutputEncoding] = useState<"utf8" | "latin1">(
    "utf8"
  );

  const [code, setCode] = useState(
    "# input your yak code\nprintln(`Hello Yak World!`)"
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [executing, setExecuting] = useState(false);
  const [triggerForUpdatingHistory, setTriggerForUpdatingHistory] =
    useState<any>(0);
  // 方法
  const openFile = () => {
    render.invoke("OpenFile").then(() => {});
  };

  const newFile = () => {};

  const tabsEdit = (key: any, event: string) => {
    switch (event) {
      case "remove":
        // 由closeIcon接管事件
        return;
      case "add":
        const length = pageCache.length + 1;
        const node = {
          key: "" + length,
          title: `Untitle-${untitledKey}`,
          code: "# input your yak code\nprintln(`Hello Yak World!`)",
        };
        pageCache.push(node);
        setCurrentTabKey(node.key);
        setUntitledKey(untitledKey + 1);
        return;
    }
  };

  const closeAllCache = () => {
    setPageCache([]);
  };

  const closeOtherCache = (key: string) => {
    setPageCache(pageCache.filter((item) => item.key === key));
  };

  const removePageCache = (index: number) => {
    if (pageCache.length - 1 === index) {
      setCurrentTabKey(pageCache[index - 1].key);
    } else {
      setCurrentTabKey(pageCache[index + 1].key);
    }
    pageCache.splice(index, 1);
    setPageCache(pageCache);
  };

  const setPageCacheCode = (index: number) => {};

  useEffect(() => {
    if (xtermRef) {
      xtermFit(xtermRef, 100, 14);
    }
  });

  useEffect(() => {
    if (!xtermRef) {
      return;
    }
    // let buffer = "";
    render.on("client-yak-error", async (e: any, data) => {
      notification["error"]({ message: `FoundError: ${JSON.stringify(data)}` });
      if (typeof data === "object") {
        setErrors([...errors, `${JSON.stringify(data)}`]);
      } else if (typeof data === "string") {
        setErrors([...errors, data]);
      } else {
        setErrors([...errors, `${data}`]);
      }
    });
    render.on("client-yak-end", () => {
      notification["info"]({ message: "Yak 代码执行完毕" });
      setTriggerForUpdatingHistory(getRandomInt(100000));
      setTimeout(() => {
        setExecuting(false);
      }, 300);
    });
    render.on("client-yak-data", async (e: any, data: ExecResult) => {
      if (data.IsMessage) {
        // alert(Buffer.from(data.Message).toString("utf8"))
      }
      if (data?.Raw) {
        writeExecResultXTerm(xtermRef, data, outputEncoding);
        // writeXTerm(xtermRef, Buffer.from(data.Raw).toString(outputEncoding).replaceAll("\n", "\r\n"))
        // monacoEditorWrite(currentOutputEditor, )
      }
    });
    return () => {
      render.removeAllListeners("client-yak-data");
      render.removeAllListeners("client-yak-end");
      render.removeAllListeners("client-yak-error");
    };
  }, [xtermRef]);

  return (
    <Layout style={{ width: "100%", height: "85vh" }}>
      <Sider style={{ backgroundColor: "rgb(51,51,51)" }}>
        <Layout>
          <Header
            style={{
              height: "25px",
              lineHeight: "25px",
              backgroundColor: "rgb(37,37,38)",
              padding: "0",
            }}
          >
            <div
              style={{
                width: "100%",
                textAlign: "right",
                paddingRight: "10px",
              }}
            >
              <Space>
                <span style={{ color: "#fff", cursor: "pointer" }}>
                  <FolderOpenOutlined />
                </span>
                <span style={{ color: "#fff", cursor: "pointer" }}>
                  <FolderAddOutlined />
                </span>
              </Space>
            </div>
          </Header>

          <Content style={{ backgroundColor: "green" }}>
            <div></div>
          </Content>
        </Layout>
      </Sider>

      <Layout>
        <Content>
          {pageCache.length > 0 ? (
            <Tabs
              type="editable-card"
              activeKey={currentTabKey}
              size={"small"}
              onChange={setCurrentTabKey}
              onEdit={(key, event) => {
                tabsEdit(key, event);
              }}
            >
              {pageCache.map((item, index) => {
                return (
                  <Tabs.TabPane
                    key={item.key}
                    tab={item.title}
                    closeIcon={
                      <CloseOutlined
                        onContextMenu={(e) => {
                          showByCursorContainer(
                            {
                              content: (
                                <>
                                  <Space direction={"vertical"}>
                                    <Button
                                      type={"link"}
                                      onClick={() => {
                                        closeAllCache();
                                      }}
                                      size={"small"}
                                    >
                                      关闭所有Tabs
                                    </Button>
                                    <Button
                                      type={"link"}
                                      onClick={() => closeOtherCache(item.key)}
                                      size={"small"}
                                    >
                                      关闭其他Tabs
                                    </Button>
                                  </Space>
                                </>
                              ),
                            },
                            e.clientX,
                            e.clientY
                          );
                        }}
                        onClick={() => removePageCache(index)}
                      />
                    }
                  >
                    <div style={{ height: 380 }}>
                      <YakEditor
                        type={"yak"}
                        value={item.code}
                        setValue={() => setPageCacheCode(index)}
                      />
                    </div>
                  </Tabs.TabPane>
                );
              })}
            </Tabs>
          ) : (
            <></>
          )}
        </Content>
        <Footer style={{ padding: "0" }}>
          <Card
            title={
              <Space>
                执行结果 Stdout / Stderr
                <Form>
                  <SelectOne
                    label={<Tag color={"geekblue"}>编码</Tag>}
                    formItemStyle={{ marginBottom: 0 }}
                    value={outputEncoding}
                    setValue={setOutputEncoding}
                    size={"small"}
                    data={[
                      { text: "GBxxx编码", value: "latin1" },
                      { text: "UTF-8编码", value: "utf8" },
                    ]}
                  />
                </Form>
                <Button
                  size={"small"}
                  icon={<DeleteOutlined />}
                  danger={true}
                  type={"link"}
                  onClick={(e) => {
                    xtermClear(xtermRef);
                  }}
                />
              </Space>
            }
            size={"small"}
            bordered={true}
            headStyle={{}}
            bodyStyle={{ padding: 0 }}
          >
            <div style={{ width: "100%", overflow: "auto" }}>
              <XTerm
                ref={xtermRef}
                options={{
                  convertEol: true,
                }}
                onResize={(r) => xtermFit(xtermRef, r.cols, 14)}
              />
            </div>
          </Card>
        </Footer>
      </Layout>
    </Layout>
  );
};
