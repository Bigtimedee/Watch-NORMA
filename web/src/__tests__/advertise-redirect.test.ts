import nextConfig from "../../next.config";

describe("public /advertise CTA", () => {
  it("permanently redirects /advertise and /advertise/ to /advertisers", async () => {
    const redirects = await nextConfig.redirects!();
    const advertise = redirects.filter((r) => r.source.startsWith("/advertise"));

    expect(advertise).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "/advertise",
          destination: "/advertisers",
          permanent: true,
        }),
        expect.objectContaining({
          source: "/advertise/",
          destination: "/advertisers",
          permanent: true,
        }),
      ])
    );
    expect(advertise).toHaveLength(2);
  });
});
