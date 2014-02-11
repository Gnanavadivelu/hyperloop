/**
 * Appcelerator Titanium is Copyright (c) 2009-2013 by Appcelerator, Inc.
 * and licensed under the Apache Public License (version 2)
 *
 * This is a generated file and any changes will be overwritten.
 */
#import "<%=modulename%>.h"
#import "TiBase.h"
#import "TiHost.h"
#import "TiUtils.h"

@interface HyperloopJS : NSObject
@property (nonatomic, copy) NSString *id;
@property (nonatomic, copy) NSString *filename;
@property (nonatomic, readwrite) BOOL loaded;
@property (nonatomic, retain) HyperloopJS *parent;
@property (nonatomic, assign) TiObjectRef exports;
@property (nonatomic, assign) TiContextRef context;
@property (nonatomic, copy) NSString *prefix;
@end

// in Hyperloop
extern HyperloopJS* HyperloopRunInVM (TiGlobalContextRef globalContextRef, NSString *name, NSString *prefix, void(^initializer)(TiContextRef,TiObjectRef));
extern NSString* HyperloopToNSStringFromString(TiStringRef);

// in KrollObject
extern id TiValueToId(KrollContext* context, TiValueRef v);

static void TiObjectPropertyIterator(TiContextRef context, TiObjectRef object, void(^visitor)(NSString *property, TiStringRef propertyName, TiValueRef propertyValue))
{
	TiPropertyNameArrayRef properties = TiObjectCopyPropertyNames(context,object);
	size_t count = TiPropertyNameArrayGetCount(properties);
	for (size_t c = 0; c < count; c++)
	{
		TiStringRef propertyName = TiPropertyNameArrayGetNameAtIndex(properties,c);
		TiValueRef exception = NULL;
		TiValueRef propertyValue = TiObjectGetProperty(context,object,propertyName,&exception);
		if (exception!=NULL)
		{
			NSLog(@"[ERROR] exception attempting to iterate properties");
			break;
		}
		size_t buflen = TiStringGetMaximumUTF8CStringSize(propertyName);
		if (buflen)
		{
			char buf[buflen];
			buflen = TiStringGetUTF8CString(propertyName, buf, buflen);
			buf[buflen] = '\0';
			NSString *property = [NSString stringWithUTF8String:buf];
			visitor(property,propertyName,propertyValue);
		}
	}
	TiPropertyNameArrayRelease(properties);
}

@implementation <%=modulename%>

#pragma mark Internal

-(id)moduleGUID
{
	return @"<%=guid%>";
}

-(NSString*)moduleId
{
	return @"<%=moduleid%>";
}

#pragma mark Lifecycle

-(void)startup
{
	[super startup];

	__block KrollContext *kroll = [[self executionContext] krollContext];
	__block TiGlobalContextRef ctx = [kroll context];

	<%=modulename%> *me = self;

	// run the hyperloop module in the global context of kroll
	HyperloopJS* module = HyperloopRunInVM(ctx,@"./<%=app%>",@"<%=prefix%>",^(TiContextRef context, TiObjectRef exports){

		// copy all the exported properties from module into this module
		TiObjectPropertyIterator(context,exports,^(NSString *property, TiStringRef propertyName, TiValueRef propertyValue){
			id value = TiValueToId(kroll,propertyValue);
			[me replaceValue:value forKey:property notification:NO];
		});		
	});
}

-(void)shutdown:(id)sender
{
	[super shutdown:sender];
}

@end
