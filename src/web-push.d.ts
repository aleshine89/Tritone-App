declare module "web-push" {
  type Keys = { publicKey: string; privateKey: string };
  type Api = {
    setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void;
    generateVAPIDKeys: () => Keys;
    sendNotification: (
      subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
      payload: string,
    ) => Promise<unknown>;
  };
  const webpush: Api;
  export default webpush;
}
